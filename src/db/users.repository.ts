import path from "path";
import { getDataDir } from "../services/data-dir";
import { mutateJsonFile, readJsonFile } from "../services/json-store";

export interface StoredUser {
  phone: string;
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
  createdAt: string;
}

export interface StoredYieldPosition {
  phone: string;
  bUsdcBalance: string;
  lastSyncedValueUsdc: string;
  updatedAt: string;
}

interface DbFile {
  users: StoredUser[];
  transactions: StoredTransaction[];
  yieldPositions: StoredYieldPosition[];
}

function dbPath(): string {
  return path.join(getDataDir(), "senda-db.json");
}

function emptyDb(): DbFile {
  return { users: [], transactions: [], yieldPositions: [] };
}

function readDb(): DbFile {
  return readJsonFile<DbFile>(dbPath(), emptyDb());
}

export async function findUserByPhone(
  phone: string
): Promise<StoredUser | null> {
  return readDb().users.find((user) => user.phone === phone) ?? null;
}

export async function upsertPrivyUser(
  phone: string,
  privyWalletId: string,
  stellarPublicKey: string
): Promise<StoredUser> {
  const next: StoredUser = { phone, privyWalletId, stellarPublicKey };
  await mutateJsonFile<DbFile>(dbPath(), emptyDb(), (db) => {
    const index = db.users.findIndex((user) => user.phone === phone);
    if (index >= 0) {
      db.users[index] = next;
    } else {
      db.users.push(next);
    }
    return db;
  });
  return next;
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
}): Promise<StoredTransaction> {
  const row: StoredTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await mutateJsonFile<DbFile>(dbPath(), emptyDb(), (db) => {
    db.transactions.unshift(row);
    return db;
  });
  return row;
}

export async function updateTransactionStatus(
  sep24TransactionId: string,
  status: string,
  txHash?: string
): Promise<void> {
  await mutateJsonFile<DbFile>(dbPath(), emptyDb(), (db) => {
    const row = db.transactions.find(
      (item) => item.sep24TransactionId === sep24TransactionId
    );
    if (!row) {
      return db;
    }
    row.status = status;
    if (txHash) {
      row.txHash = txHash;
    }
    return db;
  });
}

export async function upsertYieldPosition(
  phone: string,
  bUsdcBalance: string,
  lastSyncedValueUsdc: string
): Promise<void> {
  const next: StoredYieldPosition = {
    phone,
    bUsdcBalance,
    lastSyncedValueUsdc,
    updatedAt: new Date().toISOString(),
  };
  await mutateJsonFile<DbFile>(dbPath(), emptyDb(), (db) => {
    const index = db.yieldPositions.findIndex((item) => item.phone === phone);
    if (index >= 0) {
      db.yieldPositions[index] = next;
    } else {
      db.yieldPositions.push(next);
    }
    return db;
  });
}

export async function findYieldPosition(
  phone: string
): Promise<StoredYieldPosition | null> {
  return readDb().yieldPositions.find((item) => item.phone === phone) ?? null;
}
