import { Keypair, type Transaction } from "@stellar/stellar-sdk";
import { signStellarHash } from "./privy-client";

export interface SignableAccount {
  publicKey: string;
  secretKey?: string;
  privyWalletId?: string;
  privyUserId?: string;
  phone?: string;
}

export async function signStellarTransaction(
  account: SignableAccount,
  tx: Transaction
): Promise<void> {
  if (account.privyWalletId) {
    const signature = await signStellarHash(
      account.privyWalletId,
      Buffer.from(tx.hash())
    );
    tx.addSignature(account.publicKey, signature.toString("base64"));
    return;
  }

  if (!account.secretKey) {
    throw new Error("No hay firmante disponible para esta cuenta");
  }

  tx.sign(Keypair.fromSecret(account.secretKey));
}
