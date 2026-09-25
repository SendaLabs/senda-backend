import { usePrivyWallets } from "../config/flags";
import { findUserByPhone } from "../db/users.repository";
import { isLinkedPrivyUser } from "./privy-account";
import { issueSetupToken, setupShortUrl } from "./setup-token.store";

export function buildSetupInvite(name: string, url: string): string {
  return [
    `${name}, antes de mover plata tenés que abrir tu cuenta. Es una sola vez.`,
    "Tocá este enlace (es de Senda, dura 30 minutos):",
    url,
    "Entrá con el mismo número de WhatsApp.",
    "Cuando veas «Listo», volvé y escribime de nuevo.",
  ].join("\n");
}

export async function maybeInviteWalletSetup(
  phone: string,
  name: string
): Promise<string | null> {
  if (!usePrivyWallets()) {
    return null;
  }
  const user = await findUserByPhone(phone);
  if (isLinkedPrivyUser(user)) {
    return null;
  }
  const row = await issueSetupToken(phone);
  return buildSetupInvite(name, setupShortUrl(row.token));
}
