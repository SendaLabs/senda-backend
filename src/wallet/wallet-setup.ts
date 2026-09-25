import { usePrivyWallets } from "../config/flags";
import { findUserByPhone } from "../db/users.repository";
import { isLinkedPrivyUser } from "./privy-account";
import { issueSetupToken, setupShortUrl } from "./setup-token.store";

export function buildSetupInvite(name: string, url: string): string {
  const first = name.trim().split(/\s+/)[0] || "hola";
  return [
    `${first}, para empezar vamos a abrir tu cuenta. Es una sola vez y te lleva un minutito.`,
    "",
    "Tocá este enlace (es de Senda y dura 30 minutos):",
    url,
    "",
    "Entrá con tu email. Te llega un código al correo, creás tu cuenta y listo.",
    "Cuando veas «Listo», ya podés volver: tu cuenta va a estar creada con éxito.",
  ].join("\n");
}

export function buildSetupReadyMessage(): string {
  return [
    "¡Listo! Tu cuenta ya está creada con éxito 💚",
    "",
    "Gracias por confiar en Senda. Ya podés pedirme lo que necesites, con tus palabras o una nota de voz.",
    "",
    "¿En qué te puedo ayudar?",
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
