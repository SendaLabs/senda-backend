import fs from "fs";
import path from "path";

const queues = new Map<string, Promise<unknown>>();

export function readJsonFile<T>(filePath: string, empty: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return empty;
  }
}

export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    fs.unlinkSync(tmp);
  }
}

export async function mutateJsonFile<T>(
  filePath: string,
  empty: T,
  mutate: (current: T) => T
): Promise<T> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  const next = previous.then(
    () => {
      const updated = mutate(readJsonFile(filePath, empty));
      writeJsonFileAtomic(filePath, updated);
      return updated;
    },
    () => {
      const updated = mutate(readJsonFile(filePath, empty));
      writeJsonFileAtomic(filePath, updated);
      return updated;
    }
  );

  const tracked = next.then(
    () => undefined,
    () => undefined
  );
  queues.set(filePath, tracked);
  return next;
}
