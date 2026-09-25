import { buildSetupInviteText, buildSetupReadyText } from "../i18n/copy";
import type { Locale } from "../i18n/locale";
import { usePrivyWallets } from "../config/flags";
import { findUserByPhone } from "../db/users.repository";
import { isLinkedPrivyUser } from "./privy-account";
import { issueSetupToken, setupShortUrl } from "./setup-token.store";

export function buildSetupInvite(
  name: string,
  url: string,
  locale: Locale = "es"
): string {
  return buildSetupInviteText(name, url, locale);
}

export function buildSetupReadyMessage(locale: Locale = "es"): string {
  return buildSetupReadyText(locale);
}

export async function maybeInviteWalletSetup(
  phone: string,
  name: string,
  locale: Locale = "es"
): Promise<string | null> {
  if (!usePrivyWallets()) {
    return null;
  }
  const user = await findUserByPhone(phone);
  if (isLinkedPrivyUser(user)) {
    return null;
  }
  const row = await issueSetupToken(phone);
  return buildSetupInvite(name, setupShortUrl(row.token), locale);
}
