import { getDb } from "../db/sqlite";
import { normalizePhoneIdentity } from "./identity.service";

type PendingAck = {
  phone: string;
  text: string;
  createdAt: string;
};

type AckRow = {
  phone: string;
  text: string;
  created_at: string;
};

export function getPendingAck(phone: string): PendingAck | undefined {
  const row = getDb()
    .prepare("SELECT * FROM pending_acks WHERE phone = ?")
    .get(normalizePhoneIdentity(phone)) as AckRow | undefined;
  if (!row) {
    return undefined;
  }
  return { phone: row.phone, text: row.text, createdAt: row.created_at };
}

export async function savePendingAck(phone: string, text: string): Promise<void> {
  const key = normalizePhoneIdentity(phone);
  getDb()
    .prepare(
      `INSERT INTO pending_acks (phone, text, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`
    )
    .run(key, text, new Date().toISOString());
}

export async function clearPendingAck(phone: string): Promise<void> {
  getDb()
    .prepare("DELETE FROM pending_acks WHERE phone = ?")
    .run(normalizePhoneIdentity(phone));
}
