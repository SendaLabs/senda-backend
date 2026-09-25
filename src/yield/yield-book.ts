import { toUsdcStroops } from "../services/usdc.service";

export const YIELD_DEPOSIT_MEMO = "senda-y-in";
export const YIELD_WITHDRAW_MEMO = "senda-y-out";

export interface YieldLedgerPayment {
  from: string;
  to: string;
  amount: string;
  memo?: string | null;
}

export function netYieldStroops(
  payments: YieldLedgerPayment[],
  userPublicKey: string,
  treasuryPublicKey: string
): bigint {
  let net = 0n;
  for (const payment of payments) {
    let amount: bigint;
    try {
      amount = toUsdcStroops(payment.amount, { allowZero: true });
    } catch {
      continue;
    }
    if (payment.from === userPublicKey && payment.to === treasuryPublicKey) {
      net += amount;
      continue;
    }
    if (
      payment.from === treasuryPublicKey &&
      payment.to === userPublicKey &&
      payment.memo === YIELD_WITHDRAW_MEMO
    ) {
      net -= amount;
    }
  }
  return net > 0n ? net : 0n;
}

export function isPositiveUsdcAmount(value: string): boolean {
  try {
    return toUsdcStroops(value, { allowZero: true }) > 0n;
  } catch {
    return false;
  }
}
