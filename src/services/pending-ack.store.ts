import path from "path";
import { getDataDir } from "./data-dir";
import { normalizePhoneIdentity } from "./identity.service";
import { mutateJsonFile, readJsonFile } from "./json-store";

type PendingAck = {
  phone: string;
  text: string;
  createdAt: string;
};

type AckStore = Record<string, PendingAck>;

function ackPath(): string {
  return path.join(getDataDir(), "pending-acks.json");
}

export function getPendingAck(phone: string): PendingAck | undefined {
  return readJsonFile<AckStore>(ackPath(), {})[normalizePhoneIdentity(phone)];
}

export async function savePendingAck(phone: string, text: string): Promise<void> {
  const key = normalizePhoneIdentity(phone);
  await mutateJsonFile<AckStore>(ackPath(), {}, (store) => {
    store[key] = {
      phone: key,
      text,
      createdAt: new Date().toISOString(),
    };
    return store;
  });
}

export async function clearPendingAck(phone: string): Promise<void> {
  const key = normalizePhoneIdentity(phone);
  await mutateJsonFile<AckStore>(ackPath(), {}, (store) => {
    delete store[key];
    return store;
  });
}
