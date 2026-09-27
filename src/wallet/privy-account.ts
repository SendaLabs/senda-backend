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

const CLASSIC_STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

export function isLinkedPrivyUser(user: {
  privyWalletId?: string | null;
  stellarPublicKey?: string | null;
} | null): boolean {
  const walletId = user?.privyWalletId?.trim();
  const pub = user?.stellarPublicKey?.trim().toUpperCase() ?? "";
  return Boolean(walletId && CLASSIC_STELLAR_PUBLIC_KEY.test(pub));
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
