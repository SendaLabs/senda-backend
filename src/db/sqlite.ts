import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { getDataDir } from "../services/data-dir";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  privy_user_id TEXT,
  privy_wallet_id TEXT,
  stellar_public_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT,
  sep24_transaction_id TEXT,
  sep24_jwt_enc TEXT,
  provider_id TEXT,
  horizon_confirmed INTEGER NOT NULL DEFAULT 0,
  anchor_confirmed INTEGER NOT NULL DEFAULT 0,
  last_notified_status TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS yield_positions (
  phone TEXT PRIMARY KEY,
  shares_stroops TEXT NOT NULL DEFAULT '0',
  b_usdc_balance TEXT NOT NULL DEFAULT '0',
  accrued_yield_usdc TEXT NOT NULL DEFAULT '0',
  last_synced_value_usdc TEXT NOT NULL DEFAULT '0',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  phone TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  name TEXT NOT NULL,
  locale TEXT,
  pending_amount REAL,
  pending_partner TEXT,
  pending_destination TEXT
);
CREATE TABLE IF NOT EXISTS setup_tokens (
  token TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS wallets (
  phone TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  privy_wallet_id TEXT,
  encrypted_secret TEXT
);
CREATE TABLE IF NOT EXISTS identities (
  phone TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  passkey_id TEXT NOT NULL,
  identity_json TEXT NOT NULL,
  signers_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_recovered_at TEXT,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cobros (
  token TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  amount REAL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_acks (
  phone TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_claims (
  message_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  amount REAL NOT NULL,
  tx_hash TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS processed_messages (
  id TEXT PRIMARY KEY,
  seen_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

type Cached = { file: string; db: DatabaseSync };

let cached: Cached | null = null;

export function sqliteFilePath(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured?.startsWith("file:")) {
    const raw = configured.slice("file:".length).replace(/^\.\.\//, "");
    return path.isAbsolute(raw)
      ? raw
      : path.resolve(process.cwd(), raw.replace(/^\.\//, ""));
  }
  return path.join(getDataDir(), "senda.db");
}

export function getDb(): DatabaseSync {
  const file = sqliteFilePath();
  if (cached?.file === file) {
    return cached.db;
  }
  if (cached) {
    cached.db.close();
    cached = null;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  cached = { file, db };
  migrateLegacyJson(db);
  return db;
}

export function closeDb(): void {
  if (!cached) {
    return;
  }
  cached.db.close();
  cached = null;
}

function metaGet(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function metaSet(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

function readJson<T>(filePath: string, empty: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return empty;
  }
}

function migrateLegacyJson(db: DatabaseSync): void {
  if (metaGet(db, "json_migrated") === "1") {
    return;
  }
  const dir = getDataDir();
  const now = new Date().toISOString();

  const core = readJson<{
    users?: Array<{
      phone: string;
      privyUserId?: string | null;
      privyWalletId?: string | null;
      stellarPublicKey: string;
    }>;
    transactions?: Array<{
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
    }>;
    yieldPositions?: Array<{
      phone: string;
      sharesStroops?: string;
      bUsdcBalance: string;
      accruedYieldUsdc?: string;
      lastSyncedValueUsdc: string;
      updatedAt: string;
    }>;
  }>(path.join(dir, "senda-db.json"), {});

  const insertUser = db.prepare(
    `INSERT OR REPLACE INTO users (phone, privy_user_id, privy_wallet_id, stellar_public_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const user of core.users ?? []) {
    insertUser.run(
      user.phone,
      user.privyUserId ?? null,
      user.privyWalletId ?? null,
      user.stellarPublicKey,
      now,
      now
    );
  }

  const insertTx = db.prepare(
    `INSERT OR REPLACE INTO transactions
     (id, phone, type, amount_usdc, status, tx_hash, sep24_transaction_id, sep24_jwt_enc, provider_id, horizon_confirmed, anchor_confirmed, last_notified_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const tx of core.transactions ?? []) {
    insertTx.run(
      tx.id,
      tx.phone,
      tx.type,
      tx.amountUsdc,
      tx.status,
      tx.txHash ?? null,
      tx.sep24TransactionId ?? null,
      tx.sep24JwtEnc ?? null,
      tx.providerId ?? null,
      tx.horizonConfirmed ? 1 : 0,
      tx.anchorConfirmed ? 1 : 0,
      tx.lastNotifiedStatus ?? null,
      tx.createdAt
    );
  }

  const insertYield = db.prepare(
    `INSERT OR REPLACE INTO yield_positions
     (phone, shares_stroops, b_usdc_balance, accrued_yield_usdc, last_synced_value_usdc, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const row of core.yieldPositions ?? []) {
    insertYield.run(
      row.phone,
      row.sharesStroops ?? row.bUsdcBalance,
      row.bUsdcBalance,
      row.accruedYieldUsdc ?? "0",
      row.lastSyncedValueUsdc,
      row.updatedAt
    );
  }

  const sessions = readJson<
    Record<
      string,
      {
        step: string;
        name: string;
        locale?: string;
        pendingAmount?: number;
        pendingPartner?: string;
        pendingDestination?: string;
      }
    >
  >(path.join(dir, "sessions.json"), {});
  const insertSession = db.prepare(
    `INSERT OR REPLACE INTO sessions
     (phone, step, name, locale, pending_amount, pending_partner, pending_destination)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [phone, session] of Object.entries(sessions)) {
    insertSession.run(
      phone,
      session.step,
      session.name,
      session.locale ?? null,
      session.pendingAmount ?? null,
      session.pendingPartner ?? null,
      session.pendingDestination ?? null
    );
  }

  const tokens = readJson<
    Record<
      string,
      { token: string; phone: string; createdAt: string; expiresAt: string; usedAt?: string }
    >
  >(path.join(dir, "setup-tokens.json"), {});
  const insertToken = db.prepare(
    `INSERT OR REPLACE INTO setup_tokens (token, phone, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const row of Object.values(tokens)) {
    insertToken.run(row.token, row.phone, row.createdAt, row.expiresAt, row.usedAt ?? null);
  }

  const wallets = readJson<
    Record<
      string,
      { publicKey: string; privyWalletId?: string; encryptedSecret?: string }
    >
  >(path.join(dir, "wallets.json"), {});
  const insertWallet = db.prepare(
    `INSERT OR REPLACE INTO wallets (phone, public_key, privy_wallet_id, encrypted_secret)
     VALUES (?, ?, ?, ?)`
  );
  for (const [phone, wallet] of Object.entries(wallets)) {
    insertWallet.run(
      phone,
      wallet.publicKey,
      wallet.privyWalletId ?? null,
      wallet.encryptedSecret ?? null
    );
  }

  const identities = readJson<
    Record<
      string,
      {
        identity: unknown;
        account: string;
        passkeyId: string;
        signers: unknown;
        createdAt: string;
        lastRecoveredAt?: string;
        source: string;
      }
    >
  >(path.join(dir, "identities.json"), {});
  const insertIdentity = db.prepare(
    `INSERT OR REPLACE INTO identities
     (phone, account, passkey_id, identity_json, signers_json, created_at, last_recovered_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [phone, row] of Object.entries(identities)) {
    insertIdentity.run(
      phone,
      row.account,
      row.passkeyId,
      JSON.stringify(row.identity),
      JSON.stringify(row.signers),
      row.createdAt,
      row.lastRecoveredAt ?? null,
      row.source
    );
  }

  const cobros = readJson<
    Record<
      string,
      { token: string; destination: string; amount?: number; createdAt: string; expiresAt: string }
    >
  >(path.join(dir, "cobros.json"), {});
  const insertCobro = db.prepare(
    `INSERT OR REPLACE INTO cobros (token, destination, amount, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const row of Object.values(cobros)) {
    insertCobro.run(
      row.token,
      row.destination,
      row.amount ?? null,
      row.createdAt,
      row.expiresAt
    );
  }

  const acks = readJson<
    Record<string, { phone: string; text: string; createdAt: string }>
  >(path.join(dir, "pending-acks.json"), {});
  const insertAck = db.prepare(
    "INSERT OR REPLACE INTO pending_acks (phone, text, created_at) VALUES (?, ?, ?)"
  );
  for (const [phone, ack] of Object.entries(acks)) {
    insertAck.run(phone, ack.text, ack.createdAt);
  }

  const claims = readJson<
    Array<{ messageId: string; phone: string; amount: number; txHash?: string; createdAt: number }>
  >(path.join(dir, "credit-claims.json"), []);
  const insertClaim = db.prepare(
    "INSERT OR REPLACE INTO credit_claims (message_id, phone, amount, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const claim of claims) {
    insertClaim.run(
      claim.messageId,
      claim.phone,
      claim.amount,
      claim.txHash ?? null,
      claim.createdAt
    );
  }

  const processed = readJson<Record<string, number>>(
    path.join(dir, "processed-messages.json"),
    {}
  );
  const insertProcessed = db.prepare(
    "INSERT OR REPLACE INTO processed_messages (id, seen_at) VALUES (?, ?)"
  );
  for (const [id, seenAt] of Object.entries(processed)) {
    insertProcessed.run(id, seenAt);
  }

  metaSet(db, "json_migrated", "1");
}

export function nowIso(): string {
  return new Date().toISOString();
}
