import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "processed-messages.json");
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

type MessageStore = Record<string, number>;

let writeQueue: Promise<void> = Promise.resolve();

function readStore(): MessageStore {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as MessageStore;
  } catch {
    return {};
  }
}

function writeStore(store: MessageStore): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function prune(store: MessageStore, now: number): MessageStore {
  const next: MessageStore = {};
  for (const [id, seenAt] of Object.entries(store)) {
    if (now - seenAt <= MESSAGE_TTL_MS) {
      next[id] = seenAt;
    }
  }
  return next;
}

export function claimProcessedMessage(id: string | undefined): "missing" | "duplicate" | "claimed" {
  if (!id) {
    return "missing";
  }

  const now = Date.now();
  const store = prune(readStore(), now);
  if (store[id]) {
    return "duplicate";
  }

  store[id] = now;
  writeStore(store);
  return "claimed";
}

export async function claimProcessedMessageAsync(
  id: string | undefined
): Promise<"missing" | "duplicate" | "claimed"> {
  const result = writeQueue.then(() => claimProcessedMessage(id));
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
