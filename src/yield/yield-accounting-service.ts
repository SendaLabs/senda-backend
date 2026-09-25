import {
  findYieldPosition,
  listYieldPositions,
  positionSharesStroops,
  upsertYieldPosition,
  type StoredYieldPosition,
} from "../db/users.repository";
import { readBlendCollateralStroops } from "../services/blend.service";
import { fromUsdcStroops, USDC_SCALE } from "../services/usdc.service";
import { getTreasuryPublicKey } from "../stellar/treasury";
import { logSafeError } from "../services/whatsapp.service";

const RECONCILE_TOLERANCE = USDC_SCALE / 100n;

export interface YieldBookSnapshot {
  onChainStroops: bigint;
  bookSharesStroops: bigint;
  accruedStroops: bigint;
  deltaStroops: bigint;
  ok: boolean;
  positions: number;
}

export function allocatePooledYield(
  positions: StoredYieldPosition[],
  onChainStroops: bigint
): Array<StoredYieldPosition & { valueStroops: bigint }> {
  const shares = positions.map((row) => ({
    row,
    shares: positionSharesStroops(row),
  }));
  const totalShares = shares.reduce((sum, item) => sum + item.shares, 0n);
  const accrued = onChainStroops > totalShares ? onChainStroops - totalShares : 0n;

  return shares.map((item) => {
    const extra =
      totalShares === 0n ? 0n : (accrued * item.shares) / totalShares;
    return {
      ...item.row,
      valueStroops: item.shares + extra,
    };
  });
}

export async function syncYieldAccounting(): Promise<YieldBookSnapshot> {
  const onChainStroops = await readBlendCollateralStroops(getTreasuryPublicKey());
  const positions = await listYieldPositions();
  const allocated = allocatePooledYield(positions, onChainStroops);
  const bookSharesStroops = allocated.reduce(
    (sum, item) => sum + positionSharesStroops(item),
    0n
  );
  const accruedStroops =
    onChainStroops > bookSharesStroops ? onChainStroops - bookSharesStroops : 0n;

  for (const item of allocated) {
    const shares = positionSharesStroops(item);
    const extra = item.valueStroops - shares;
    await upsertYieldPosition(
      item.phone,
      shares.toString(),
      fromUsdcStroops(item.valueStroops),
      {
        sharesStroops: shares.toString(),
        accruedYieldUsdc: fromUsdcStroops(extra),
      }
    );
  }

  const deltaStroops =
    onChainStroops > bookSharesStroops
      ? onChainStroops - bookSharesStroops
      : bookSharesStroops - onChainStroops;

  return {
    onChainStroops,
    bookSharesStroops,
    accruedStroops,
    deltaStroops,
    ok: true,
    positions: allocated.length,
  };
}

export async function reconcileYieldDaily(): Promise<YieldBookSnapshot> {
  const snapshot = await syncYieldAccounting();
  const claimed = snapshot.bookSharesStroops + snapshot.accruedStroops;
  const delta =
    snapshot.onChainStroops >= claimed
      ? snapshot.onChainStroops - claimed
      : claimed - snapshot.onChainStroops;
  const ok = delta <= RECONCILE_TOLERANCE;
  if (!ok) {
    console.error(
      `ALERTA yield: libro ${fromUsdcStroops(snapshot.bookSharesStroops)} + yield ${fromUsdcStroops(snapshot.accruedStroops)} vs on-chain ${fromUsdcStroops(snapshot.onChainStroops)}`
    );
  } else {
    console.log(
      `Yield reconcile OK: on-chain=${fromUsdcStroops(snapshot.onChainStroops)} book=${fromUsdcStroops(snapshot.bookSharesStroops)} yield=${fromUsdcStroops(snapshot.accruedStroops)}`
    );
  }

  return { ...snapshot, deltaStroops: delta, ok };
}

export async function getUserYieldView(phone: string): Promise<{
  sharesUsdc: string;
  accruedYieldUsdc: string;
  currentValueUsdc: string;
}> {
  const { healYieldPositionFromChain } = await import("./yield-ledger");
  await healYieldPositionFromChain(phone);
  const stored = await findYieldPosition(phone);
  if (!stored) {
    return { sharesUsdc: "0", accruedYieldUsdc: "0", currentValueUsdc: "0" };
  }
  const shares = positionSharesStroops(stored);
  return {
    sharesUsdc: fromUsdcStroops(shares),
    accruedYieldUsdc: stored.accruedYieldUsdc || "0",
    currentValueUsdc: stored.lastSyncedValueUsdc || fromUsdcStroops(shares),
  };
}

export async function safeSyncYieldAccounting(): Promise<void> {
  try {
    await syncYieldAccounting();
  } catch (error) {
    logSafeError("Yield accounting horario", error);
  }
}

export async function safeReconcileYieldDaily(): Promise<void> {
  try {
    await reconcileYieldDaily();
  } catch (error) {
    logSafeError("Yield reconcile diario", error);
  }
}
