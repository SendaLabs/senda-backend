import type { CustodialAccount } from "./account.types";
import { getDb } from "../db/sqlite";
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

export function getWalletByPhone(phone: string): CustodialAccount | undefined {
  const record = getDb()
    .prepare("SELECT * FROM wallets WHERE phone = ?")
    .get(phone) as WalletRow | undefined;
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
  const previous = getDb()
    .prepare("SELECT * FROM wallets WHERE phone = ?")
    .get(phone) as WalletRow | undefined;
  const persistSecret = options?.persistSecret === true;
  let encryptedSecret: string | null = null;

  if (persistSecret && wallet.secretKey) {
    encryptedSecret = isVaultCiphertext(wallet.secretKey)
      ? wallet.secretKey
      : encryptString(wallet.secretKey);
  } else if (previous?.encrypted_secret && persistSecret) {
    encryptedSecret = previous.encrypted_secret;
  }

  getDb()
    .prepare(
      `INSERT INTO wallets (phone, public_key, privy_wallet_id, encrypted_secret)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         public_key = excluded.public_key,
         privy_wallet_id = excluded.privy_wallet_id,
         encrypted_secret = excluded.encrypted_secret`
    )
    .run(
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
