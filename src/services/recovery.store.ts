import type { Sep30IdentityRecord } from "./account.types";
import { getDb } from "../db/sqlite";
import { identityKey } from "./identity.service";

type IdentityRow = {
  phone: string;
  account: string;
  passkey_id: string;
  identity_json: string;
  signers_json: string;
  created_at: string;
  last_recovered_at: string | null;
  source: string;
};

function mapIdentity(row: IdentityRow): Sep30IdentityRecord {
  return {
    identity: JSON.parse(row.identity_json),
    account: row.account,
    passkeyId: row.passkey_id,
    signers: JSON.parse(row.signers_json),
    createdAt: row.created_at,
    lastRecoveredAt: row.last_recovered_at ?? undefined,
    source: row.source as Sep30IdentityRecord["source"],
  };
}

export function getIdentityRecord(
  phone: string
): Sep30IdentityRecord | undefined {
  const row = getDb()
    .prepare("SELECT * FROM identities WHERE phone = ?")
    .get(identityKey(phone)) as IdentityRow | undefined;
  return row ? mapIdentity(row) : undefined;
}

export async function saveIdentityRecord(
  phone: string,
  record: Sep30IdentityRecord
): Promise<Sep30IdentityRecord> {
  const key = identityKey(phone);
  getDb()
    .prepare(
      `INSERT INTO identities
       (phone, account, passkey_id, identity_json, signers_json, created_at, last_recovered_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         account = excluded.account,
         passkey_id = excluded.passkey_id,
         identity_json = excluded.identity_json,
         signers_json = excluded.signers_json,
         last_recovered_at = excluded.last_recovered_at,
         source = excluded.source`
    )
    .run(
      key,
      record.account,
      record.passkeyId,
      JSON.stringify(record.identity),
      JSON.stringify(record.signers),
      record.createdAt,
      record.lastRecoveredAt ?? null,
      record.source
    );
  return record;
}

export async function markIdentityRecovered(
  phone: string
): Promise<Sep30IdentityRecord | undefined> {
  const current = getIdentityRecord(phone);
  if (!current) {
    return undefined;
  }
  const updated: Sep30IdentityRecord = {
    ...current,
    lastRecoveredAt: new Date().toISOString(),
  };
  await saveIdentityRecord(phone, updated);
  return updated;
}
