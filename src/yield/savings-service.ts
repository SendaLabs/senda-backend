import {
  createTransaction,
  findYieldPosition,
  positionSharesStroops,
  upsertYieldPosition,
} from "../db/users.repository";
import {
  YIELD_DEPOSIT_MEMO,
  YIELD_WITHDRAW_MEMO,
} from "./yield-book";
import { canUseSavings } from "../services/identity.service";
import { buildSubmitOperation } from "../services/blend.service";
import { getOrCreateUserAccount } from "../services/stellar.service";
import {
  fromUsdcStroops,
  getUsdcBalance,
  toUsdcStroops,
  transferUsdcFromWallet,
} from "../services/usdc.service";
import { startMercadoPagoWithdraw } from "../services/sep24-withdraw.service";
import { waitForTreasuryCredit } from "../stellar/horizon-listener";
import {
  ensureTreasuryUsdcTrustline,
  getTreasuryWallet,
} from "../stellar/treasury";
import { treasurySimulateThenSubmit } from "../stellar/simulate-submit";
import { logSafeError } from "../services/whatsapp.service";
import {
  areYieldDepositsBlocked,
  refreshUtilizationGuard,
} from "./utilization-guard";
import { getUserYieldView, syncYieldAccounting } from "./yield-accounting-service";

const RequestType = {
  SupplyCollateral: 2,
  WithdrawCollateral: 3,
};

export class YieldDepositsBlockedError extends Error {
  constructor() {
    super(
      "Por ahora no estamos tomando más plata para rendir: el pool está muy usado. Probá más tarde."
    );
    this.name = "YieldDepositsBlockedError";
  }
}

export class BlendOperationError extends Error {
  constructor(action: "deposit" | "withdraw") {
    super(
      action === "deposit"
        ? "No pude poner tu plata a rendir en el pool. Tu USDC quedó a salvo; escribime y lo resolvemos."
        : "No pude sacar tu plata del pool ahora. No moví nada de tu saldo; probá de nuevo en un rato."
    );
    this.name = "BlendOperationError";
  }
}

/** After Blend fails, never continue to share updates, payouts, or success copy. */
export function abortOnBlendFailure(
  action: "deposit" | "withdraw",
  error: unknown
): never {
  logSafeError(
    action === "deposit"
      ? "Blend SupplyCollateral falló; no actualizo shares ni confirmo éxito"
      : "Blend WithdrawCollateral falló; no pago ni bajo shares",
    error
  );
  throw new BlendOperationError(action);
}

async function availableStroops(phone: string): Promise<bigint> {
  await syncYieldAccounting().catch((error) =>
    logSafeError("Yield sync al leer posición", error)
  );
  const view = await getUserYieldView(phone);
  return toUsdcStroops(view.currentValueUsdc, { allowZero: true });
}

export async function deposit(
  userId: string,
  amount: number
): Promise<{ amountUsdc: string; valueUsdc: string; txHash: string }> {
  if (!canUseSavings(userId)) {
    throw new Error("Todavía no podemos poner tu plata a rendir.");
  }
  await refreshUtilizationGuard();
  if (areYieldDepositsBlocked()) {
    throw new YieldDepositsBlockedError();
  }

  const user = await getOrCreateUserAccount(userId);
  const stroops = toUsdcStroops(amount);
  const walletBalance = await getUsdcBalance(user.publicKey);
  if (walletBalance < stroops) {
    throw new Error("No te alcanza el saldo para poner esa plata a rendir");
  }

  const treasury = await ensureTreasuryUsdcTrustline();
  const transfer = await transferUsdcFromWallet(user, treasury, amount, {
    memo: YIELD_DEPOSIT_MEMO,
  });
  await waitForTreasuryCredit({
    from: user.publicKey,
    amountStroops: stroops,
    timeoutMs: 90_000,
  });

  let blendHash: string;
  try {
    blendHash = await treasurySimulateThenSubmit(
      buildSubmitOperation(treasury, stroops, RequestType.SupplyCollateral)
    );
  } catch (error) {
    abortOnBlendFailure("deposit", error);
  }

  const previous = await findYieldPosition(userId);
  const nextShares = positionSharesStroops(
    previous ?? {
      phone: userId,
      sharesStroops: "0",
      bUsdcBalance: "0",
      accruedYieldUsdc: "0",
      lastSyncedValueUsdc: "0",
      updatedAt: "",
    }
  ) + stroops;
  await upsertYieldPosition(userId, nextShares.toString(), fromUsdcStroops(nextShares), {
    sharesStroops: nextShares.toString(),
    accruedYieldUsdc: previous?.accruedYieldUsdc ?? "0",
  });
  await createTransaction({
    phone: userId,
    type: "yield_deposit",
    amountUsdc: transfer.amountUsdc,
    status: "confirmed",
    txHash: blendHash,
  });

  return {
    amountUsdc: transfer.amountUsdc,
    valueUsdc: fromUsdcStroops(nextShares),
    txHash: blendHash,
  };
}

export async function withdraw(
  userId: string,
  amount: number,
  options?: { offrampToMercadoPago?: boolean }
): Promise<{ amountUsdc: string; valueUsdc: string; txHash: string }> {
  const stroops = toUsdcStroops(amount);
  const available = await availableStroops(userId);
  if (available < stroops) {
    throw new Error("No tenés esa cantidad rindiendo");
  }

  const treasury = await ensureTreasuryUsdcTrustline();
  let blendHash: string;
  try {
    blendHash = await treasurySimulateThenSubmit(
      buildSubmitOperation(treasury, stroops, RequestType.WithdrawCollateral)
    );
  } catch (error) {
    abortOnBlendFailure("withdraw", error);
  }

  const user = await getOrCreateUserAccount(userId);
  const payout = await transferUsdcFromWallet(
    getTreasuryWallet(),
    user.publicKey,
    amount,
    { memo: YIELD_WITHDRAW_MEMO }
  );

  const previous = await findYieldPosition(userId);
  const currentShares = positionSharesStroops(
    previous ?? {
      phone: userId,
      sharesStroops: "0",
      bUsdcBalance: "0",
      accruedYieldUsdc: "0",
      lastSyncedValueUsdc: "0",
      updatedAt: "",
    }
  );
  const nextShares = currentShares > stroops ? currentShares - stroops : 0n;
  await upsertYieldPosition(userId, nextShares.toString(), fromUsdcStroops(nextShares), {
    sharesStroops: nextShares.toString(),
  });
  await createTransaction({
    phone: userId,
    type: "yield_withdraw",
    amountUsdc: payout.amountUsdc,
    status: "confirmed",
    txHash: blendHash || payout.txHash,
  });

  if (options?.offrampToMercadoPago) {
    await startMercadoPagoWithdraw(userId, amount);
  }

  return {
    amountUsdc: payout.amountUsdc,
    valueUsdc: fromUsdcStroops(nextShares),
    txHash: blendHash || payout.txHash,
  };
}

export async function getPosition(phone: string): Promise<{
  suppliedUsdc: string;
  currentValueUsdc: string;
}> {
  const view = await getUserYieldView(phone);
  return {
    suppliedUsdc: view.sharesUsdc,
    currentValueUsdc: view.currentValueUsdc,
  };
}
