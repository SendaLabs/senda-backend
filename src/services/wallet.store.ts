import fs from "fs";
import path from "path";
import type { CreatedAccount } from "./stellar.service";

const WALLETS_PATH = path.join(process.cwd(), "data", "wallets.json");

type WalletStore = Record<string, CreatedAccount>;

function readStore(): WalletStore {
  try {
    const raw = fs.readFileSync(WALLETS_PATH, "utf8");
    return JSON.parse(raw) as WalletStore;
  } catch {
    return {};
  }
}

function writeStore(store: WalletStore): void {
  fs.mkdirSync(path.dirname(WALLETS_PATH), { recursive: true });
  fs.writeFileSync(WALLETS_PATH, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getWalletByPhone(phone: string): CreatedAccount | undefined {
  return readStore()[phone];
}

export function saveWallet(phone: string, wallet: CreatedAccount): CreatedAccount {
  const store = readStore();
  store[phone] = wallet;
  writeStore(store);
  return wallet;
}
