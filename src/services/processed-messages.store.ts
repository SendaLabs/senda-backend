import { getDb } from "../db/sqlite";

const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

export function claimProcessedMessage(
  id: string | undefined
): "missing" | "duplicate" | "claimed" {
  if (!id) {
    return "missing";
  }

  const now = Date.now();
  const db = getDb();
  db.prepare("DELETE FROM processed_messages WHERE seen_at < ?").run(
    now - MESSAGE_TTL_MS
  );

  const existing = db
    .prepare("SELECT id FROM processed_messages WHERE id = ?")
    .get(id) as { id: string } | undefined;
  if (existing) {
    return "duplicate";
  }

  db.prepare("INSERT INTO processed_messages (id, seen_at) VALUES (?, ?)").run(
    id,
    now
  );
  return "claimed";
}

export async function claimProcessedMessageAsync(
  id: string | undefined
): Promise<"missing" | "duplicate" | "claimed"> {
  return claimProcessedMessage(id);
}
