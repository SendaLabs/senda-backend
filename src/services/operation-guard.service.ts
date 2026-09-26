import { dbGet, dbRun } from "../db/client";
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
  await dbRun("DELETE FROM credit_claims WHERE created_at < ?", now - DAY_MS);

  const existing = await dbGet<ClaimRow>(
    "SELECT * FROM credit_claims WHERE message_id = ?",
    messageId
  );
  if (existing?.tx_hash) {
    return { status: "duplicate", txHash: existing.tx_hash };
  }
  if (existing) {
    throw new CreditInFlightError();
  }

  const hourly = await dbGet<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM credit_claims WHERE phone = ? AND created_at >= ?",
    identity,
    now - HOUR_MS
  );
  // node-pg returns COUNT(*) as string (int8); coerce before compare.
  if (Number(hourly?.count ?? 0) >= MAX_CREDITS_PER_HOUR) {
    throw new CreditRateLimitError("Alcanzaste el tope de envíos por hora");
  }

  const daily = await dbGet<{ total: number | string }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM credit_claims WHERE phone = ? AND created_at >= ?",
    identity,
    now - DAY_MS
  );
  if (Number(daily?.total ?? 0) + amount > MAX_DAILY_USDC) {
    throw new CreditRateLimitError("Alcanzaste el tope diario de envíos");
  }

  try {
    await dbRun(
      "INSERT INTO credit_claims (message_id, phone, amount, tx_hash, created_at) VALUES (?, ?, ?, NULL, ?)",
      messageId,
      identity,
      amount,
      now
    );
  } catch (error) {
    // Unique race under Postgres/SQLite: treat as in-flight duplicate.
    const again = await dbGet<ClaimRow>(
      "SELECT * FROM credit_claims WHERE message_id = ?",
      messageId
    );
    if (again?.tx_hash) {
      return { status: "duplicate", txHash: again.tx_hash };
    }
    if (again) {
      throw new CreditInFlightError();
    }
    throw error;
  }
  return { status: "claimed" };
}

export async function finishCreditClaim(
  messageId: string,
  txHash: string
): Promise<void> {
  await dbRun(
    "UPDATE credit_claims SET tx_hash = ? WHERE message_id = ?",
    txHash,
    messageId
  );
}
