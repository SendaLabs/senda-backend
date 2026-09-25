import { findUserByPhone } from "../db/users.repository";
import { saveWallet } from "../services/wallet.store";
import type { CustodialAccount } from "../services/account.types";

export class WalletSetupRequiredError extends Error {
  constructor() {
    super(
      "Todavía no abriste tu cuenta. Completá el alta de una sola vez y después escribime de nuevo."
    );
    this.name = "WalletSetupRequiredError";
  }
}

export function isLinkedPrivyUser(user: {
  privyWalletId?: string | null;
  stellarPublicKey?: string | null;
} | null): boolean {
  return Boolean(user?.privyWalletId && user.stellarPublicKey);
}

export async function resolvePrivyAccount(
  phone: string
): Promise<CustodialAccount> {
  const existing = await findUserByPhone(phone);
  if (!isLinkedPrivyUser(existing) || !existing) {
    throw new WalletSetupRequiredError();
  }

  const account: CustodialAccount = {
    publicKey: existing.stellarPublicKey,
    secretKey: "",
    privyWalletId: existing.privyWalletId ?? undefined,
    privyUserId: existing.privyUserId ?? undefined,
    phone,
  };
  await saveWallet(phone, account, { persistSecret: false });
  return account;
}
