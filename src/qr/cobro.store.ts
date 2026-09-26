import { randomBytes } from "crypto";
import { dbGet, dbRun } from "../db/client";
import { getBackendPublicUrl } from "../wallet/setup-token.store";

const COBRO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredCobro {
  token: string;
  destination: string;
  amount?: number;
  createdAt: string;
  expiresAt: string;
}

type CobroRow = {
  token: string;
  destination: string;
  amount: number | null;
  created_at: string;
  expires_at: string;
};

function mapCobro(row: CobroRow): StoredCobro {
  return {
    token: row.token,
    destination: row.destination,
    amount: row.amount ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function cobroPublicUrl(token: string): string {
  return `${getBackendPublicUrl()}/c/${token}`;
}

export function cobroChatToken(token: string): string {
  return `/c/${token}`;
}

export function extractCobroToken(text: string): string | null {
  const match = text.match(/\/c\/([a-f0-9]{16,64})/i);
  return match?.[1] ?? null;
}

export async function issueCobro(input: {
  destination: string;
  amount?: number;
}): Promise<StoredCobro> {
  const now = Date.now();
  const row: StoredCobro = {
    token: randomBytes(16).toString("hex"),
    destination: input.destination,
    amount: input.amount,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + COBRO_TTL_MS).toISOString(),
  };
  await dbRun(
    `INSERT INTO cobros (token, destination, amount, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    row.token,
    row.destination,
    row.amount ?? null,
    row.createdAt,
    row.expiresAt
  );
  return row;
}

export async function peekCobro(token: string): Promise<StoredCobro | null> {
  const row = await dbGet<CobroRow>("SELECT * FROM cobros WHERE token = ?", token);
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }
  return mapCobro(row);
}
