import { PoolV2 } from "@blend-capital/blend-sdk";
import { getNetworkConfig } from "../services/stellar.service";
import { getUsdcSacId } from "../services/usdc.service";
import { logSafeError } from "../services/whatsapp.service";

const DEFAULT_POOL = "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";
const DEFAULT_MAX = 0.85;

let depositsBlocked = false;
let lastUtilization: number | null = null;

export function getMaxBlendUtilization(): number {
  const raw = process.env.BLEND_MAX_UTILIZATION?.trim();
  if (raw) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 && parsed < 1
      ? parsed
      : DEFAULT_MAX;
  }
  // El pool de Testnet suele estar >85%. En public seguimos el tope conservador.
  return process.env.STELLAR_NETWORK === "public" ? DEFAULT_MAX : 0.95;
}

export function areYieldDepositsBlocked(): boolean {
  return depositsBlocked;
}

export function getLastBlendUtilization(): number | null {
  return lastUtilization;
}

export function setYieldDepositsBlockedForTests(blocked: boolean): void {
  depositsBlocked = blocked;
}

export async function readBlendUtilization(): Promise<number> {
  const { rpcUrl, networkPassphrase } = getNetworkConfig();
  const poolId = process.env.BLEND_POOL_ID?.trim() || DEFAULT_POOL;
  const pool = await PoolV2.load(
    { rpc: rpcUrl, passphrase: networkPassphrase },
    poolId
  );
  const reserve =
    pool.reserves.get(getUsdcSacId()) ?? [...pool.reserves.values()][0];
  if (!reserve) {
    throw new Error("No encontré la reserva USDC del pool de Blend");
  }
  return reserve.getUtilizationFloat();
}

export async function refreshUtilizationGuard(): Promise<{
  utilization: number;
  blocked: boolean;
}> {
  try {
    const utilization = await readBlendUtilization();
    lastUtilization = utilization;
    depositsBlocked = utilization >= getMaxBlendUtilization();
    if (depositsBlocked) {
      console.warn(
        `Blend utilization ${utilization.toFixed(3)} >= ${getMaxBlendUtilization()} — depósitos bloqueados`
      );
    }
    return { utilization, blocked: depositsBlocked };
  } catch (error) {
    logSafeError("Blend utilization", error);
    return { utilization: lastUtilization ?? 0, blocked: depositsBlocked };
  }
}
