import type { Sep30Identity } from "./account.types";

export function normalizePhoneIdentity(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    throw new Error("El identificador de WhatsApp no tiene un teléfono válido");
  }
  return digits;
}

export function toSep30Identity(phone: string): Sep30Identity {
  return {
    type: "phone_number",
    authMethod: "whatsapp_passkey",
    value: normalizePhoneIdentity(phone),
  };
}

export function identityKey(phone: string): string {
  return `phone_number:${normalizePhoneIdentity(phone)}`;
}

export type KycTier = "unverified" | "basic";

export function getKycTier(_phone: string): KycTier {
  return "basic";
}

export function canUseSavings(phone: string): boolean {
  return getKycTier(phone) !== "unverified";
}
