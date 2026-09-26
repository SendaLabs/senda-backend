import { randomBytes } from "crypto";
import { dbGet, dbRun } from "../db/client";

export const SETUP_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface SetupToken {
  token: string;
  phone: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

type TokenRow = {
  token: string;
  phone: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

function mapToken(row: TokenRow): SetupToken {
  return {
    token: row.token,
    phone: row.phone,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
  };
}

export function getWebSetupBaseUrl(): string {
  return (
    process.env.WEB_SETUP_PUBLIC_URL?.trim() || "http://localhost:3001"
  ).replace(/\/$/, "");
}

export function getBackendPublicUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function setupShortUrl(token: string): string {
  return `${getWebSetupBaseUrl()}/s/${token}`;
}

export function setupFullUrl(token: string): string {
  return `${getWebSetupBaseUrl()}/setup?token=${token}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    return "****";
  }
  return `+${digits.slice(0, 4)} **** ${digits.slice(-3)}`;
}

export async function issueSetupToken(phone: string): Promise<SetupToken> {
  const now = Date.now();
  const reusable = await dbGet<TokenRow>(
    `SELECT * FROM setup_tokens
     WHERE phone = ? AND used_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`,
    phone,
    new Date(now + 60_000).toISOString()
  );
  if (reusable) {
    return mapToken(reusable);
  }

  const row: SetupToken = {
    token: randomBytes(12).toString("hex"),
    phone,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SETUP_TOKEN_TTL_MS).toISOString(),
  };
  await dbRun(
    `INSERT INTO setup_tokens (token, phone, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, NULL)`,
    row.token,
    row.phone,
    row.createdAt,
    row.expiresAt
  );
  return row;
}

export async function peekSetupToken(token: string): Promise<SetupToken | null> {
  const row = await dbGet<TokenRow>(
    "SELECT * FROM setup_tokens WHERE token = ?",
    token
  );
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }
  return mapToken(row);
}

export async function consumeSetupToken(token: string): Promise<SetupToken> {
  const usedAt = new Date().toISOString();
  const now = new Date().toISOString();
  // Atomic consume so two parallel /api/link-wallet cannot both succeed.
  const row = await dbGet<TokenRow>(
    `UPDATE setup_tokens
     SET used_at = ?
     WHERE token = ? AND used_at IS NULL AND expires_at > ?
     RETURNING *`,
    usedAt,
    token,
    now
  );
  if (!row) {
    throw new Error("Ese enlace de alta ya no sirve. Pedime uno nuevo por WhatsApp.");
  }
  return mapToken(row);
}
