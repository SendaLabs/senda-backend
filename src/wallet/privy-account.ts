import { findUserByPhone, upsertPrivyUser } from "../db/users.repository";
import { createStellarWallet } from "./privy-client";
import type { CustodialAccount } from "../services/account.types";

export async function resolvePrivyAccount(
  phone: string
): Promise<CustodialAccount> {
  const existing = await findUserByPhone(phone);
  if (existing?.stellarPublicKey) {
    return {
      publicKey: existing.stellarPublicKey,
      secretKey: "",
      privyWalletId: existing.privyWalletId ?? undefined,
    };
  }

  const wallet = await createStellarWallet(`whatsapp:${phone}`);
  await upsertPrivyUser(phone, wallet.walletId, wallet.address);
  return {
    publicKey: wallet.address,
    secretKey: "",
    privyWalletId: wallet.walletId,
  };
}
