import fs from "fs";
import path from "path";
import type { Sep30IdentityRecord } from "./account.types";
import { identityKey } from "./identity.service";

const IDENTITIES_PATH = path.join(process.cwd(), "data", "identities.json");

type IdentityStore = Record<string, Sep30IdentityRecord>;

function readStore(): IdentityStore {
  try {
    const raw = fs.readFileSync(IDENTITIES_PATH, "utf8");
    return JSON.parse(raw) as IdentityStore;
  } catch {
    return {};
  }
}

function writeStore(store: IdentityStore): void {
  fs.mkdirSync(path.dirname(IDENTITIES_PATH), { recursive: true });
  fs.writeFileSync(IDENTITIES_PATH, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getIdentityRecord(
  phone: string
): Sep30IdentityRecord | undefined {
  return readStore()[identityKey(phone)];
}

export function saveIdentityRecord(
  phone: string,
  record: Sep30IdentityRecord
): Sep30IdentityRecord {
  const store = readStore();
  store[identityKey(phone)] = record;
  writeStore(store);
  return record;
}

export function markIdentityRecovered(
  phone: string
): Sep30IdentityRecord | undefined {
  const store = readStore();
  const key = identityKey(phone);
  const current = store[key];
  if (!current) {
    return undefined;
  }

  const updated: Sep30IdentityRecord = {
    ...current,
    lastRecoveredAt: new Date().toISOString(),
  };
  store[key] = updated;
  writeStore(store);
  return updated;
}
