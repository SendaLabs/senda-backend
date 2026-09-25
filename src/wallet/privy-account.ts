import { findUserByPhone, upsertPrivyUser } from "../db/users.repository";
import { saveWallet } from "../services/wallet.store";
import type { CustodialAccount } from "../services/account.types";
import { createStellarWallet } from "./privy-client";

export async function resolvePrivyAccount(
  phone: string
): Promise<CustodialAccount> {
  const existing = await findUserByPhone(phone);
  if (existing?.stellarPublicKey && existing.privyWalletId) {
    const account: CustodialAccount = {
      publicKey: existing.stellarPublicKey,
      secretKey: "",
      privyWalletId: existing.privyWalletId,
    };
    await saveWallet(phone, account, { persistSecret: false });
    return account;
  }

  const wallet = await createStellarWallet(`whatsapp:${phone}`);
  await upsertPrivyUser(phone, wallet.walletId, wallet.address);
  const account: CustodialAccount = {
    publicKey: wallet.address,
    secretKey: "",
    privyWalletId: wallet.walletId,
  };
  await saveWallet(phone, account, { persistSecret: false });
  return account;
}
