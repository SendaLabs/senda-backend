import { randomBytes } from "crypto";
import { getDb } from "../db/sqlite";
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
  getDb()
    .prepare(
      `INSERT INTO cobros (token, destination, amount, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      row.token,
      row.destination,
      row.amount ?? null,
      row.createdAt,
      row.expiresAt
    );
  return row;
}

export function peekCobro(token: string): StoredCobro | null {
  const row = getDb()
    .prepare("SELECT * FROM cobros WHERE token = ?")
    .get(token) as CobroRow | undefined;
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }
  return mapCobro(row);
}
