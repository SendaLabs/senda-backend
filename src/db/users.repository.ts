import { dbAll, dbGet, dbRun } from "./client";
import { nowIso } from "./sqlite";

export interface StoredUser {
  phone: string;
  privyUserId?: string | null;
  privyWalletId: string | null;
  stellarPublicKey: string;
}

export interface StoredTransaction {
  id: string;
  phone: string;
  type: string;
  amountUsdc: string;
  status: string;
  txHash?: string;
  sep24TransactionId?: string;
  sep24JwtEnc?: string;
  providerId?: string;
  horizonConfirmed?: boolean;
  anchorConfirmed?: boolean;
  lastNotifiedStatus?: string;
  createdAt: string;
}

export interface StoredYieldPosition {
  phone: string;
  sharesStroops: string;
  bUsdcBalance: string;
  accruedYieldUsdc: string;
  lastSyncedValueUsdc: string;
  updatedAt: string;
}

type UserRow = {
  phone: string;
  privy_user_id: string | null;
  privy_wallet_id: string | null;
  stellar_public_key: string;
};

type TxRow = {
  id: string;
  phone: string;
  type: string;
  amount_usdc: string;
  status: string;
  tx_hash: string | null;
  sep24_transaction_id: string | null;
  sep24_jwt_enc: string | null;
  provider_id: string | null;
  horizon_confirmed: number | string | boolean;
  anchor_confirmed: number | string | boolean;
  last_notified_status: string | null;
  created_at: string;
};

type YieldRow = {
  phone: string;
  shares_stroops: string;
  b_usdc_balance: string;
  accrued_yield_usdc: string;
  last_synced_value_usdc: string;
  updated_at: string;
};

function mapUser(row: UserRow): StoredUser {
  return {
    phone: row.phone,
    privyUserId: row.privy_user_id,
    privyWalletId: row.privy_wallet_id,
    stellarPublicKey: row.stellar_public_key,
  };
}

function mapTx(row: TxRow): StoredTransaction {
  return {
    id: row.id,
    phone: row.phone,
    type: row.type,
    amountUsdc: row.amount_usdc,
    status: row.status,
    txHash: row.tx_hash ?? undefined,
    sep24TransactionId: row.sep24_transaction_id ?? undefined,
    sep24JwtEnc: row.sep24_jwt_enc ?? undefined,
    providerId: row.provider_id ?? undefined,
    // INTEGER 0/1 from SQLite/Postgres — avoid Boolean("0") === true
    horizonConfirmed: Number(row.horizon_confirmed) === 1,
    anchorConfirmed: Number(row.anchor_confirmed) === 1,
    lastNotifiedStatus: row.last_notified_status ?? undefined,
    createdAt: row.created_at,
  };
}

function mapYield(row: YieldRow): StoredYieldPosition {
  return {
    phone: row.phone,
    sharesStroops: row.shares_stroops,
    bUsdcBalance: row.b_usdc_balance,
    accruedYieldUsdc: row.accrued_yield_usdc,
    lastSyncedValueUsdc: row.last_synced_value_usdc,
    updatedAt: row.updated_at,
  };
}

export async function findUserByPhone(
  phone: string
): Promise<StoredUser | null> {
  const row = await dbGet<UserRow>("SELECT * FROM users WHERE phone = ?", phone);
  return row ? mapUser(row) : null;
}

export async function upsertPrivyUser(
  phone: string,
  privyWalletId: string,
  stellarPublicKey: string,
  privyUserId?: string
): Promise<StoredUser> {
  const now = nowIso();
  await dbRun(
    `INSERT INTO users (phone, privy_user_id, privy_wallet_id, stellar_public_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       privy_user_id = excluded.privy_user_id,
       privy_wallet_id = excluded.privy_wallet_id,
       stellar_public_key = excluded.stellar_public_key,
       updated_at = excluded.updated_at`,
    phone,
    privyUserId ?? null,
    privyWalletId,
    stellarPublicKey,
    now,
    now
  );
  return {
    phone,
    privyWalletId,
    stellarPublicKey,
    privyUserId: privyUserId ?? null,
  };
}

export async function ensureUserRecord(
  phone: string,
  stellarPublicKey: string
): Promise<StoredUser> {
  const existing = await findUserByPhone(phone);
  if (existing) {
    return existing;
  }
  return upsertPrivyUser(phone, "", stellarPublicKey);
}

export async function createTransaction(input: {
  phone: string;
  type: string;
  amountUsdc: string;
  status: string;
  txHash?: string;
  sep24TransactionId?: string;
  sep24JwtEnc?: string;
  providerId?: string;
  horizonConfirmed?: boolean;
  anchorConfirmed?: boolean;
  lastNotifiedStatus?: string;
}): Promise<StoredTransaction> {
  const row: StoredTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    ...input,
  };
  await dbRun(
    `INSERT INTO transactions
     (id, phone, type, amount_usdc, status, tx_hash, sep24_transaction_id, sep24_jwt_enc, provider_id, horizon_confirmed, anchor_confirmed, last_notified_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.phone,
    row.type,
    row.amountUsdc,
    row.status,
    row.txHash ?? null,
    row.sep24TransactionId ?? null,
    row.sep24JwtEnc ?? null,
    row.providerId ?? null,
    row.horizonConfirmed ? 1 : 0,
    row.anchorConfirmed ? 1 : 0,
    row.lastNotifiedStatus ?? null,
    row.createdAt
  );
  return row;
}

export async function updateTransactionStatus(
  sep24TransactionId: string,
  status: string,
  txHash?: string
): Promise<void> {
  await patchSep24Transaction(sep24TransactionId, { status, txHash });
}

export async function patchSep24Transaction(
  sep24TransactionId: string,
  patch: Partial<
    Pick<
      StoredTransaction,
      | "status"
      | "txHash"
      | "horizonConfirmed"
      | "anchorConfirmed"
      | "lastNotifiedStatus"
      | "providerId"
    >
  >
): Promise<StoredTransaction | null> {
  const current = await findSep24Transaction(sep24TransactionId);
  if (!current) {
    return null;
  }
  const next: StoredTransaction = {
    ...current,
    ...patch,
    txHash: patch.txHash ?? current.txHash,
  };
  await dbRun(
    `UPDATE transactions SET
       status = ?, tx_hash = ?, horizon_confirmed = ?, anchor_confirmed = ?,
       last_notified_status = ?, provider_id = ?
     WHERE sep24_transaction_id = ?`,
    next.status,
    next.txHash ?? null,
    next.horizonConfirmed ? 1 : 0,
    next.anchorConfirmed ? 1 : 0,
    next.lastNotifiedStatus ?? null,
    next.providerId ?? null,
    sep24TransactionId
  );
  return next;
}

export async function findSep24Transaction(
  sep24TransactionId: string
): Promise<StoredTransaction | null> {
  const row = await dbGet<TxRow>(
    "SELECT * FROM transactions WHERE sep24_transaction_id = ?",
    sep24TransactionId
  );
  return row ? mapTx(row) : null;
}

export async function upsertYieldPosition(
  phone: string,
  bUsdcBalance: string,
  lastSyncedValueUsdc: string,
  extras?: { sharesStroops?: string; accruedYieldUsdc?: string }
): Promise<void> {
  await dbRun(
    `INSERT INTO yield_positions
     (phone, shares_stroops, b_usdc_balance, accrued_yield_usdc, last_synced_value_usdc, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       shares_stroops = excluded.shares_stroops,
       b_usdc_balance = excluded.b_usdc_balance,
       accrued_yield_usdc = excluded.accrued_yield_usdc,
       last_synced_value_usdc = excluded.last_synced_value_usdc,
       updated_at = excluded.updated_at`,
    phone,
    extras?.sharesStroops ?? bUsdcBalance,
    bUsdcBalance,
    extras?.accruedYieldUsdc ?? "0",
    lastSyncedValueUsdc,
    nowIso()
  );
}

export async function listYieldPositions(): Promise<StoredYieldPosition[]> {
  const rows = await dbAll<YieldRow>("SELECT * FROM yield_positions");
  return rows.map(mapYield);
}

export function positionSharesStroops(row: StoredYieldPosition): bigint {
  const raw = row.sharesStroops || row.bUsdcBalance || "0";
  if (!/^-?\d+$/.test(raw)) {
    return 0n;
  }
  return BigInt(raw);
}

export async function listPendingSep24(): Promise<StoredTransaction[]> {
  const rows = await dbAll<TxRow>(
    `SELECT * FROM transactions
     WHERE type = 'withdraw_sep24'
       AND (status = 'pending' OR status = 'pending_user_transfer_start')`
  );
  return rows.map(mapTx);
}

export async function findYieldPosition(
  phone: string
): Promise<StoredYieldPosition | null> {
  const row = await dbGet<YieldRow>(
    "SELECT * FROM yield_positions WHERE phone = ?",
    phone
  );
  return row ? mapYield(row) : null;
}
