import fs from "fs";
import path from "path";

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

const DB_PATH = path.join(process.cwd(), "data", "senda-db.json");

function emptyDb(): DbFile {
  return { users: [], transactions: [], yieldPositions: [] };
}

function readDb(): DbFile {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as DbFile;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: DbFile): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
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
  const db = readDb();
  const next: StoredUser = { phone, privyWalletId, stellarPublicKey };
  const index = db.users.findIndex((user) => user.phone === phone);
  if (index >= 0) {
    db.users[index] = next;
  } else {
    db.users.push(next);
  }
  writeDb(db);
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
  const db = readDb();
  const row: StoredTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  db.transactions.unshift(row);
  writeDb(db);
  return row;
}

export async function updateTransactionStatus(
  sep24TransactionId: string,
  status: string,
  txHash?: string
): Promise<void> {
  const db = readDb();
  const row = db.transactions.find(
    (item) => item.sep24TransactionId === sep24TransactionId
  );
  if (!row) {
    return;
  }
  row.status = status;
  if (txHash) {
    row.txHash = txHash;
  }
  writeDb(db);
}

export async function upsertYieldPosition(
  phone: string,
  bUsdcBalance: string,
  lastSyncedValueUsdc: string
): Promise<void> {
  const db = readDb();
  const next: StoredYieldPosition = {
    phone,
    bUsdcBalance,
    lastSyncedValueUsdc,
    updatedAt: new Date().toISOString(),
  };
  const index = db.yieldPositions.findIndex((item) => item.phone === phone);
  if (index >= 0) {
    db.yieldPositions[index] = next;
  } else {
    db.yieldPositions.push(next);
  }
  writeDb(db);
}

export async function findYieldPosition(
  phone: string
): Promise<StoredYieldPosition | null> {
  return readDb().yieldPositions.find((item) => item.phone === phone) ?? null;
}
