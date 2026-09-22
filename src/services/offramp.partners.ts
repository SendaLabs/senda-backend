import { randomBytes } from "crypto";
import type { OfframpPartnerId } from "./offramp.store";

export interface PartnerQuote {
  partner: OfframpPartnerId;
  label: string;
  locationHint: string;
  pickupCode: string;
  reference: string;
  expiresAt: string;
}

const PARTNERS: Record<
  OfframpPartnerId,
  { label: string; locationHint: string }
> = {
  moneygram: {
    label: "MoneyGram",
    locationHint: "Cualquier sucursal MoneyGram. Pedí un retiro Senda.",
  },
  comercio: {
    label: "comercio de la red Senda",
    locationHint: "Un kiosco o comercio adherido a Senda. Mostrá el código.",
  },
  western_union: {
    label: "Western Union",
    locationHint: "Cualquier sucursal Western Union. Pedí un retiro Senda.",
  },
};

function pickupCode(): string {
  return `SENDA-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function listPartnerLabels(): string {
  return "MoneyGram, un comercio de la red Senda o Western Union";
}

export function extractPartner(text: string): OfframpPartnerId | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (/money\s*gram|moneygram/.test(normalized)) {
    return "moneygram";
  }
  if (/western|wu\b/.test(normalized)) {
    return "western_union";
  }
  if (/comercio|sucursal|tienda|kiosco|red senda/.test(normalized)) {
    return "comercio";
  }
  return null;
}

export async function createPartnerWithdrawal(
  partner: OfframpPartnerId,
  amountUsdc: number,
  phone: string
): Promise<PartnerQuote> {
  const meta = PARTNERS[partner];
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);

  return {
    partner,
    label: meta.label,
    locationHint: meta.locationHint,
    pickupCode: pickupCode(),
    reference: `MG-${phone.slice(-6)}-${Math.round(amountUsdc * 100)}`,
    expiresAt: expires.toISOString(),
  };
}

export function partnerPrompt(): string {
  return [
    "¿Dónde querés retirar el efectivo?",
    "• MoneyGram",
    "• Un comercio de la red Senda",
    "• Western Union",
  ].join("\n");
}
