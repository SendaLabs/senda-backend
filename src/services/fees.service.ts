import { BASE_FEE, Horizon } from "@stellar/stellar-sdk";

const FEE_MULTIPLIER = 3;

function defaultHorizon(): Horizon.Server {
  return new Horizon.Server(
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
  );
}

export async function getInclusionFee(
  operations = 1,
  horizon: Horizon.Server = defaultHorizon()
): Promise<string> {
  const fallback = Number(BASE_FEE) * Math.max(1, operations) * FEE_MULTIPLIER;

  try {
    const stats = await horizon.feeStats();
    const last = Number(stats.last_ledger_base_fee ?? BASE_FEE);
    const charged = Number(stats.fee_charged?.mode ?? last);
    const perOp = Math.max(Number(BASE_FEE), last, Math.ceil(charged));
    return String(perOp * Math.max(1, operations));
  } catch {
    return String(fallback);
  }
}
