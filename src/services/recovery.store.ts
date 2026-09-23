import path from "path";
import type { Sep30IdentityRecord } from "./account.types";
import { getDataDir } from "./data-dir";
import { identityKey } from "./identity.service";
import { mutateJsonFile, readJsonFile } from "./json-store";

type IdentityStore = Record<string, Sep30IdentityRecord>;

function identitiesPath(): string {
  return path.join(getDataDir(), "identities.json");
}

export function getIdentityRecord(
  phone: string
): Sep30IdentityRecord | undefined {
  return readJsonFile<IdentityStore>(identitiesPath(), {})[identityKey(phone)];
}

export async function saveIdentityRecord(
  phone: string,
  record: Sep30IdentityRecord
): Promise<Sep30IdentityRecord> {
  await mutateJsonFile<IdentityStore>(identitiesPath(), {}, (store) => {
    store[identityKey(phone)] = record;
    return store;
  });
  return record;
}

export async function markIdentityRecovered(
  phone: string
): Promise<Sep30IdentityRecord | undefined> {
  let updated: Sep30IdentityRecord | undefined;
  await mutateJsonFile<IdentityStore>(identitiesPath(), {}, (store) => {
    const key = identityKey(phone);
    const current = store[key];
    if (!current) {
      return store;
    }
    updated = {
      ...current,
      lastRecoveredAt: new Date().toISOString(),
    };
    store[key] = updated;
    return store;
  });
  return updated;
}
