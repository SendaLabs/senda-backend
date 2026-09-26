import { dbGet, dbRun } from "../db/client";

const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

export async function claimProcessedMessage(
  id: string | undefined
): Promise<"missing" | "duplicate" | "claimed"> {
  if (!id) {
    return "missing";
  }

  const now = Date.now();
  await dbRun("DELETE FROM processed_messages WHERE seen_at < ?", now - MESSAGE_TTL_MS);

  // Atomic claim: concurrent webhook deliveries must not both process.
  const inserted = await dbGet<{ id: string }>(
    `INSERT INTO processed_messages (id, seen_at) VALUES (?, ?)
     ON CONFLICT(id) DO NOTHING
     RETURNING id`,
    id,
    now
  );
  return inserted ? "claimed" : "duplicate";
}

export async function claimProcessedMessageAsync(
  id: string | undefined
): Promise<"missing" | "duplicate" | "claimed"> {
  return claimProcessedMessage(id);
}
