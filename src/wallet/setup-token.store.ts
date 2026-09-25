import { randomBytes } from "crypto";
import path from "path";
import { getDataDir } from "../services/data-dir";
import { mutateJsonFile, readJsonFile } from "../services/json-store";

export const SETUP_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface SetupToken {
  token: string;
  phone: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

type TokenStore = Record<string, SetupToken>;

function tokensPath(): string {
  return path.join(getDataDir(), "setup-tokens.json");
}

export function getWebSetupBaseUrl(): string {
  return (
    process.env.WEB_SETUP_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://localhost:3001"
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
  return `${getBackendPublicUrl()}/s/${token}`;
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
  const store = readJsonFile<TokenStore>(tokensPath(), {});
  const reusable = Object.values(store).find(
    (row) =>
      row.phone === phone &&
      !row.usedAt &&
      Date.parse(row.expiresAt) > now + 60_000
  );
  if (reusable) {
    return reusable;
  }

  const token = randomBytes(12).toString("hex");
  const row: SetupToken = {
    token,
    phone,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SETUP_TOKEN_TTL_MS).toISOString(),
  };
  await mutateJsonFile<TokenStore>(tokensPath(), {}, (next) => {
    next[token] = row;
    return next;
  });
  return row;
}

export function peekSetupToken(token: string): SetupToken | null {
  const row = readJsonFile<TokenStore>(tokensPath(), {})[token];
  if (!row) {
    return null;
  }
  if (row.usedAt) {
    return null;
  }
  if (Date.parse(row.expiresAt) <= Date.now()) {
    return null;
  }
  return row;
}

export async function consumeSetupToken(token: string): Promise<SetupToken> {
  let consumed: SetupToken | null = null;
  await mutateJsonFile<TokenStore>(tokensPath(), {}, (store) => {
    const row = store[token];
    if (!row || row.usedAt || Date.parse(row.expiresAt) <= Date.now()) {
      return store;
    }
    row.usedAt = new Date().toISOString();
    store[token] = row;
    consumed = { ...row };
    return store;
  });
  if (!consumed) {
    throw new Error("Ese enlace de alta ya no sirve. Pedime uno nuevo por WhatsApp.");
  }
  return consumed;
}
