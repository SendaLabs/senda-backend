import { randomBytes } from "crypto";
import path from "path";
import { getDataDir } from "../services/data-dir";
import { mutateJsonFile, readJsonFile } from "../services/json-store";
import { getBackendPublicUrl } from "../wallet/setup-token.store";

const COBRO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredCobro {
  token: string;
  destination: string;
  amount?: number;
  createdAt: string;
  expiresAt: string;
}

type CobroStore = Record<string, StoredCobro>;

function cobroPath(): string {
  return path.join(getDataDir(), "cobros.json");
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
  const token = randomBytes(16).toString("hex");
  const row: StoredCobro = {
    token,
    destination: input.destination,
    amount: input.amount,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + COBRO_TTL_MS).toISOString(),
  };
  await mutateJsonFile<CobroStore>(cobroPath(), {}, (next) => {
    next[token] = row;
    return next;
  });
  return row;
}

export function peekCobro(token: string): StoredCobro | null {
  const row = readJsonFile<CobroStore>(cobroPath(), {})[token];
  if (!row) {
    return null;
  }
  if (Date.parse(row.expiresAt) <= Date.now()) {
    return null;
  }
  return row;
}
