import { buildSetupInviteText, buildSetupReadyText, setupInviteButton } from "../i18n/copy";
import type { Locale } from "../i18n/locale";
import { usePrivyWallets } from "../config/flags";
import { findUserByPhone } from "../db/users.repository";
import { isLinkedPrivyUser } from "./privy-account";
import { issueSetupToken, setupShortUrl } from "./setup-token.store";

export type SetupInvite = {
  text: string;
  url: string;
  button: string;
};

export function buildSetupInvite(name: string, locale: Locale = "es"): string {
  return buildSetupInviteText(name, locale);
}

export function buildSetupReadyMessage(locale: Locale = "es"): string {
  return buildSetupReadyText(locale);
}

export async function maybeInviteWalletSetup(
  phone: string,
  name: string,
  locale: Locale = "es"
): Promise<SetupInvite | null> {
  if (!usePrivyWallets()) {
    return null;
  }
  const user = await findUserByPhone(phone);
  if (isLinkedPrivyUser(user)) {
    return null;
  }
  const row = await issueSetupToken(phone);
  return {
    text: buildSetupInvite(name, locale),
    url: setupShortUrl(row.token),
    button: setupInviteButton(locale),
  };
}
