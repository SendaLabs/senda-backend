import path from "path";
import { getDataDir } from "./data-dir";
import { normalizePhoneIdentity } from "./identity.service";
import { mutateJsonFile } from "./json-store";

const MAX_CREDITS_PER_HOUR = 5;
const MAX_DAILY_USDC = 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type CreditClaim = {
  messageId: string;
  phone: string;
  amount: number;
  txHash?: string;
  createdAt: number;
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

function claimsPath(): string {
  return path.join(getDataDir(), "credit-claims.json");
}

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
  type ClaimOutcome =
    | { status: "claimed" }
    | { status: "duplicate"; txHash: string }
    | { status: "in_flight" }
    | { status: "rate_limited"; reason: string };
  let outcome: ClaimOutcome | undefined;

  await mutateJsonFile<CreditClaim[]>(claimsPath(), [], (rows) => {
    const fresh = rows.filter((row) => now - row.createdAt <= DAY_MS);
    const existing = fresh.find((row) => row.messageId === messageId);
    if (existing?.txHash) {
      outcome = { status: "duplicate", txHash: existing.txHash };
      return fresh;
    }
    if (existing) {
      outcome = { status: "in_flight" };
      return fresh;
    }

    const hourly = fresh.filter(
      (row) => row.phone === identity && now - row.createdAt <= HOUR_MS
    );
    if (hourly.length >= MAX_CREDITS_PER_HOUR) {
      outcome = { status: "rate_limited", reason: "hourly" };
      return fresh;
    }

    const dailyAmount = fresh
      .filter((row) => row.phone === identity)
      .reduce((sum, row) => sum + row.amount, 0);
    if (dailyAmount + amount > MAX_DAILY_USDC) {
      outcome = { status: "rate_limited", reason: "daily" };
      return fresh;
    }

    fresh.unshift({
      messageId,
      phone: identity,
      amount,
      createdAt: now,
    });
    outcome = { status: "claimed" };
    return fresh;
  });

  if (!outcome) {
    throw new Error("No se pudo registrar el crédito");
  }
  if (outcome.status === "in_flight") {
    throw new CreditInFlightError();
  }
  if (outcome.status === "rate_limited") {
    throw new CreditRateLimitError(
      outcome.reason === "daily"
        ? "Alcanzaste el tope diario de envíos"
        : "Alcanzaste el tope de envíos por hora"
    );
  }
  return outcome;
}

export async function finishCreditClaim(
  messageId: string,
  txHash: string
): Promise<void> {
  await mutateJsonFile<CreditClaim[]>(claimsPath(), [], (rows) =>
    rows.map((row) =>
      row.messageId === messageId ? { ...row, txHash } : row
    )
  );
}
