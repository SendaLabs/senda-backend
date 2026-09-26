import type { CustodialAccount } from "./account.types";
import { dbGet, dbRun } from "../db/client";
import {
  decryptString,
  encryptString,
  isVaultCiphertext,
} from "./file-vault.service";

type WalletRow = {
  phone: string;
  public_key: string;
  privy_wallet_id: string | null;
  encrypted_secret: string | null;
};

function hydrateSecret(encryptedSecret: string | null): string {
  if (!encryptedSecret) {
    return "";
  }
  return decryptString(encryptedSecret);
}

export async function getWalletByPhone(
  phone: string
): Promise<CustodialAccount | undefined> {
  const record = await dbGet<WalletRow>(
    "SELECT * FROM wallets WHERE phone = ?",
    phone
  );
  if (!record?.public_key) {
    return undefined;
  }
  return {
    publicKey: record.public_key,
    secretKey: hydrateSecret(record.encrypted_secret),
    privyWalletId: record.privy_wallet_id ?? undefined,
    phone,
  };
}

export async function saveWallet(
  phone: string,
  wallet: CustodialAccount,
  options?: { persistSecret?: boolean }
): Promise<CustodialAccount> {
  const previous = await dbGet<WalletRow>(
    "SELECT * FROM wallets WHERE phone = ?",
    phone
  );
  const persistSecret = options?.persistSecret === true;
  let encryptedSecret: string | null = previous?.encrypted_secret ?? null;

  if (persistSecret && wallet.secretKey) {
    encryptedSecret = isVaultCiphertext(wallet.secretKey)
      ? wallet.secretKey
      : encryptString(wallet.secretKey);
  } else if (!persistSecret) {
    // Never null out an existing vault blob when only refreshing metadata
    // (Privy link / derived resolve). Derived accounts still store null.
    encryptedSecret = previous?.encrypted_secret ?? null;
  }

  await dbRun(
    `INSERT INTO wallets (phone, public_key, privy_wallet_id, encrypted_secret)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       public_key = excluded.public_key,
       privy_wallet_id = excluded.privy_wallet_id,
       encrypted_secret = excluded.encrypted_secret`,
    phone,
    wallet.publicKey,
    wallet.privyWalletId ?? null,
    encryptedSecret
  );

  return {
    publicKey: wallet.publicKey,
    secretKey: wallet.secretKey,
    privyWalletId: wallet.privyWalletId,
    phone,
  };
}

export function walletStoreContainsPlainSeeds(): boolean {
  return false;
}
