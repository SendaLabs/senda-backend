import { Keypair } from "@stellar/stellar-sdk";
import { getOrCreateUserAccount } from "./stellar.service";
import {
  ensureUsdcTrustline,
  fromUsdcStroops,
  getUsdcBalance,
  toUsdcStroops,
  transferUsdcFromWallet,
} from "./usdc.service";
import {
  createPartnerWithdrawal,
  extractPartner,
  listPartnerLabels,
  partnerPrompt,
} from "./offramp.partners";
import {
  getLatestPendingOrder,
  listOrdersNeedingReconcile,
  saveOfframpOrder,
  type OfframpOrder,
  type OfframpPartnerId,
} from "./offramp.store";
import { logSafeError } from "./whatsapp.service";

export class OfframpInsufficientFundsError extends Error {
  readonly available: string;
  readonly requested: number;

  constructor(available: string, requested: number) {
    super("insufficient funds for offramp");
    this.name = "OfframpInsufficientFundsError";
    this.available = available;
    this.requested = requested;
  }
}

export { extractPartner, listPartnerLabels, partnerPrompt };
export type { OfframpPartnerId };

export function getOfframpVaultPublicKey(): string {
  const configured = process.env.STELLAR_OFFRAMP_PUBLIC_KEY?.trim();
  if (!configured || !/^G[A-Z2-7]{55}$/.test(configured)) {
    throw new Error(
      "Falta STELLAR_OFFRAMP_PUBLIC_KEY (cuenta G… distinta de la operativa)"
    );
  }

  const ops = process.env.STELLAR_SECRET_KEY?.trim();
  if (ops && Keypair.fromSecret(ops).publicKey() === configured) {
    throw new Error(
      "STELLAR_OFFRAMP_PUBLIC_KEY no puede ser la misma cuenta operativa"
    );
  }
  return configured;
}

export async function createCashWithdrawal(
  phone: string,
  amount: number,
  partner: OfframpPartnerId
): Promise<OfframpOrder> {
  const user = await getOrCreateUserAccount(phone);
  await ensureUsdcTrustline(user);

  const available = await getUsdcBalance(user.publicKey);
  const needed = toUsdcStroops(amount);
  if (available < needed) {
    throw new OfframpInsufficientFundsError(fromUsdcStroops(available), amount);
  }

  const quote = await createPartnerWithdrawal(partner, amount, phone);
  const vault = getOfframpVaultPublicKey();
  const locked = await saveOfframpOrder({
    id: quote.reference,
    phone,
    amountUsdc: fromUsdcStroops(needed),
    partner,
    partnerLabel: quote.label,
    pickupCode: quote.pickupCode,
    locationHint: quote.locationHint,
    expiresAt: quote.expiresAt,
    status: "pending_lock",
    txHash: "",
    createdAt: new Date().toISOString(),
  });

  try {
    const transfer = await transferUsdcFromWallet(user, vault, amount);
    try {
      return await saveOfframpOrder({
        ...locked,
        amountUsdc: transfer.amountUsdc,
        status: "pending_pickup",
        txHash: transfer.txHash,
      });
    } catch (error) {
      logSafeError("offramp: no se pudo guardar el código después del pago", error);
      await saveOfframpOrder({
        ...locked,
        status: "needs_reconcile",
        txHash: transfer.txHash,
      }).catch((saveError) => logSafeError("offramp reconcile", saveError));
      return {
        ...locked,
        amountUsdc: transfer.amountUsdc,
        status: "pending_pickup",
        txHash: transfer.txHash,
      };
    }
  } catch (error) {
    await saveOfframpOrder({ ...locked, status: "failed" }).catch((saveError) =>
      logSafeError("offramp failed lock", saveError)
    );
    throw error;
  }
}

export function getOpenCashWithdrawal(phone: string): OfframpOrder | undefined {
  return getLatestPendingOrder(phone);
}

export async function getSpendableUsdc(phone: string): Promise<string> {
  const user = await getOrCreateUserAccount(phone);
  const balance = await getUsdcBalance(user.publicKey);
  return fromUsdcStroops(balance);
}

export async function reconcileOfframpOrders(): Promise<void> {
  for (const order of listOrdersNeedingReconcile()) {
    if (order.txHash) {
      await saveOfframpOrder({ ...order, status: "pending_pickup" });
      continue;
    }
    await saveOfframpOrder({ ...order, status: "failed" });
  }
}
