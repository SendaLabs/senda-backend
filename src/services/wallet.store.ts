import path from "path";
import type { CustodialAccount } from "./account.types";
import { getDataDir } from "./data-dir";
import {
  decryptString,
  encryptString,
  isVaultCiphertext,
} from "./file-vault.service";
import { mutateJsonFile, readJsonFile } from "./json-store";

const WALLETS_PATH = path.join(getDataDir(), "wallets.json");

type PersistedWallet = {
  publicKey: string;
  privyWalletId?: string;
  encryptedSecret?: string;
  secretKey?: string;
};

type WalletStore = Record<string, PersistedWallet>;

function walletsPath(): string {
  return path.join(getDataDir(), "wallets.json");
}

function stripPlainSecret(record: PersistedWallet): PersistedWallet {
  const next: PersistedWallet = {
    publicKey: record.publicKey,
  };
  if (record.privyWalletId) {
    next.privyWalletId = record.privyWalletId;
  }
  if (record.encryptedSecret) {
    next.encryptedSecret = record.encryptedSecret;
  }
  return next;
}

function hydrateSecret(record: PersistedWallet): string {
  if (record.encryptedSecret) {
    return decryptString(record.encryptedSecret);
  }
  if (record.secretKey && !isVaultCiphertext(record.secretKey)) {
    return record.secretKey;
  }
  return "";
}

export function getWalletByPhone(phone: string): CustodialAccount | undefined {
  const record = readJsonFile<WalletStore>(walletsPath(), {})[phone];
  if (!record?.publicKey) {
    return undefined;
  }

  return {
    publicKey: record.publicKey,
    secretKey: hydrateSecret(record),
    privyWalletId: record.privyWalletId,
    phone,
  };
}

export async function saveWallet(
  phone: string,
  wallet: CustodialAccount,
  options?: { persistSecret?: boolean }
): Promise<CustodialAccount> {
  await mutateJsonFile<WalletStore>(walletsPath(), {}, (store) => {
    const previous = store[phone];
    const persistSecret = options?.persistSecret === true;
    let encryptedSecret: string | undefined;

    if (persistSecret && wallet.secretKey) {
      encryptedSecret = isVaultCiphertext(wallet.secretKey)
        ? wallet.secretKey
        : encryptString(wallet.secretKey);
    } else if (previous?.encryptedSecret && persistSecret) {
      encryptedSecret = previous.encryptedSecret;
    }

    store[phone] = stripPlainSecret({
      publicKey: wallet.publicKey,
      privyWalletId: wallet.privyWalletId,
      encryptedSecret,
    });
    return store;
  });

  return {
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey,
    privyWalletId: wallet.privyWalletId,
    phone,
  };
}

export function walletStoreContainsPlainSeeds(filePath = WALLETS_PATH): boolean {
  const store = readJsonFile<WalletStore>(filePath, {});
  return Object.values(store).some((record) =>
    Boolean(record.secretKey && /^S[A-Z2-7]{55}$/.test(record.secretKey))
  );
}
