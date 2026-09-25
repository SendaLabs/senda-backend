import { Horizon } from "@stellar/stellar-sdk";
import {
  findYieldPosition,
  positionSharesStroops,
  upsertYieldPosition,
} from "../db/users.repository";
import { getOrCreateUserAccount } from "../services/stellar.service";
import {
  fromUsdcStroops,
  getUsdcAsset,
} from "../services/usdc.service";
import { logSafeError } from "../services/whatsapp.service";
import { getTreasuryPublicKey } from "../stellar/treasury";
import { netYieldStroops, type YieldLedgerPayment } from "./yield-book";

export {
  YIELD_DEPOSIT_MEMO,
  YIELD_WITHDRAW_MEMO,
  isPositiveUsdcAmount,
  netYieldStroops,
  type YieldLedgerPayment,
} from "./yield-book";

async function paymentMemo(
  record: Horizon.ServerApi.PaymentOperationRecord
): Promise<string | null> {
  try {
    const tx = await record.transaction();
    return typeof tx.memo === "string" && tx.memo.length > 0 ? tx.memo : null;
  } catch {
    return null;
  }
}

export async function loadYieldLedgerPayments(
  userPublicKey: string,
  treasuryPublicKey: string
): Promise<YieldLedgerPayment[]> {
  const usdc = getUsdcAsset();
  const server = new Horizon.Server(
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
  );
  const page = await server
    .payments()
    .forAccount(userPublicKey)
    .order("desc")
    .limit(200)
    .call();

  const collected: YieldLedgerPayment[] = [];
  for (const record of page.records) {
    const payment = record as Horizon.ServerApi.PaymentOperationRecord;
    if (payment.type !== "payment") {
      continue;
    }
    if (
      payment.asset_code !== usdc.code ||
      payment.asset_issuer !== usdc.issuer
    ) {
      continue;
    }
    const from = payment.from;
    const to = payment.to;
    if (!from || !to || !payment.amount) {
      continue;
    }
    const isDeposit = from === userPublicKey && to === treasuryPublicKey;
    const isPayout = from === treasuryPublicKey && to === userPublicKey;
    if (!isDeposit && !isPayout) {
      continue;
    }
    collected.push({
      from,
      to,
      amount: payment.amount,
      memo: isPayout ? await paymentMemo(payment) : null,
    });
  }
  return collected;
}

export async function healYieldPositionFromChain(phone: string): Promise<void> {
  try {
    const user = await getOrCreateUserAccount(phone);
    const treasury = getTreasuryPublicKey();
    const payments = await loadYieldLedgerPayments(user.publicKey, treasury);
    const net = netYieldStroops(payments, user.publicKey, treasury);
    const stored = await findYieldPosition(phone);
    const local = stored ? positionSharesStroops(stored) : 0n;
    if (net <= local) {
      return;
    }
    await upsertYieldPosition(phone, net.toString(), fromUsdcStroops(net), {
      sharesStroops: net.toString(),
      accruedYieldUsdc: stored?.accruedYieldUsdc ?? "0",
    });
  } catch (error) {
    logSafeError("Yield ledger Horizon", error);
  }
}
