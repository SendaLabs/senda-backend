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

  const existing = await dbGet<{ id: string }>(
    "SELECT id FROM processed_messages WHERE id = ?",
    id
  );
  if (existing) {
    return "duplicate";
  }

  await dbRun("INSERT INTO processed_messages (id, seen_at) VALUES (?, ?)", id, now);
  return "claimed";
}

export async function claimProcessedMessageAsync(
  id: string | undefined
): Promise<"missing" | "duplicate" | "claimed"> {
  return claimProcessedMessage(id);
}
