import { getDb } from "../db/sqlite";
import { normalizePhoneIdentity } from "./identity.service";

const MAX_CREDITS_PER_HOUR = 5;
const MAX_DAILY_USDC = 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ClaimRow = {
  message_id: string;
  phone: string;
  amount: number;
  tx_hash: string | null;
  created_at: number;
};

export class CreditRateLimitError extends Error {
  constructor(message = "Alcanzaste el tope de envíos por ahora") {
    super(message);
    this.name = "CreditRateLimitError";
  }
}

export class CreditInFlightError extends Error {
  constructor() {
    super("Ese envío ya se está procesando");
    this.name = "CreditInFlightError";
  }
}

const phoneLocks = new Map<string, Promise<unknown>>();

export async function withPhoneLock<T>(
  phone: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = normalizePhoneIdentity(phone);
  const previous = phoneLocks.get(key) ?? Promise.resolve();
  let result!: T;
  const next = previous.then(
    async () => {
      result = await fn();
    },
    async () => {
      result = await fn();
    }
  );
  phoneLocks.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  await next;
  return result;
}

export async function beginCreditClaim(
  messageId: string,
  phone: string,
  amount: number
): Promise<{ status: "claimed" } | { status: "duplicate"; txHash: string }> {
  const identity = normalizePhoneIdentity(phone);
  const now = Date.now();
  const db = getDb();
  db.prepare("DELETE FROM credit_claims WHERE created_at < ?").run(now - DAY_MS);

  const existing = db
    .prepare("SELECT * FROM credit_claims WHERE message_id = ?")
    .get(messageId) as ClaimRow | undefined;
  if (existing?.tx_hash) {
    return { status: "duplicate", txHash: existing.tx_hash };
  }
  if (existing) {
    throw new CreditInFlightError();
  }

  const hourly = db
    .prepare(
      "SELECT COUNT(*) AS count FROM credit_claims WHERE phone = ? AND created_at >= ?"
    )
    .get(identity, now - HOUR_MS) as { count: number };
  if (hourly.count >= MAX_CREDITS_PER_HOUR) {
    throw new CreditRateLimitError("Alcanzaste el tope de envíos por hora");
  }

  const daily = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM credit_claims WHERE phone = ?"
    )
    .get(identity) as { total: number };
  if (daily.total + amount > MAX_DAILY_USDC) {
    throw new CreditRateLimitError("Alcanzaste el tope diario de envíos");
  }

  db.prepare(
    "INSERT INTO credit_claims (message_id, phone, amount, tx_hash, created_at) VALUES (?, ?, ?, NULL, ?)"
  ).run(messageId, identity, amount, now);
  return { status: "claimed" };
}

export async function finishCreditClaim(
  messageId: string,
  txHash: string
): Promise<void> {
  getDb()
    .prepare("UPDATE credit_claims SET tx_hash = ? WHERE message_id = ?")
    .run(txHash, messageId);
}
