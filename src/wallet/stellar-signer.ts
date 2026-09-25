import { Keypair, type Transaction } from "@stellar/stellar-sdk";
import { usePrivyWallets } from "../config/flags";
import { signStellarHash } from "./privy-client";

export interface SignableAccount {
  publicKey: string;
  secretKey?: string;
  privyWalletId?: string;
}

export async function signStellarTransaction(
  account: SignableAccount,
  tx: Transaction
): Promise<void> {
  if (account.privyWalletId && usePrivyWallets()) {
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
