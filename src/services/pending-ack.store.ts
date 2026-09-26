import { dbGet, dbRun } from "../db/client";
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

export async function getPendingAck(
  phone: string
): Promise<PendingAck | undefined> {
  const row = await dbGet<AckRow>(
    "SELECT * FROM pending_acks WHERE phone = ?",
    normalizePhoneIdentity(phone)
  );
  if (!row) {
    return undefined;
  }
  return { phone: row.phone, text: row.text, createdAt: row.created_at };
}

export async function savePendingAck(phone: string, text: string): Promise<void> {
  const key = normalizePhoneIdentity(phone);
  await dbRun(
    `INSERT INTO pending_acks (phone, text, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`,
    key,
    text,
    new Date().toISOString()
  );
}

export async function clearPendingAck(phone: string): Promise<void> {
  await dbRun(
    "DELETE FROM pending_acks WHERE phone = ?",
    normalizePhoneIdentity(phone)
  );
}
