import { extractUsdAmount, normalizeText } from "../services/intent.service";

/** Mínimo para apartar. Por debajo no se ofrece: el cobro queda para usar. */
export const SAVINGS_MIN_USDC = 2;

/**
 * Ilustración, no una tasa cotizada. Blend se mueve; el mensaje lo dice.
 * 4% anual es un piso chico para que la proyección no prometa de más.
 */
export const SAVINGS_ILLUSTRATIVE_APY = 0.04;
export const SAVINGS_HORIZON_YEARS = 5;

export type SavingsReply =
  | "accept"
  | "decline"
  | { amount: number }
  | "other";

/**
 * Parte chica del cobro: al menos 2 USDC, cerca del 10%, y nunca más de la mitad,
 * para que quede plata para gastar o bajar a Mercado Pago.
 * Si el cobro no alcanza para apartar 2 y dejar otros 2, no hay oferta.
 */
export function suggestSavingsSlice(receivedUsdc: number): number | null {
  if (!Number.isFinite(receivedUsdc) || receivedUsdc < SAVINGS_MIN_USDC * 2) {
    return null;
  }
  const tenPercent = Math.round(receivedUsdc * 0.1 * 100) / 100;
  const slice = Math.min(
    Math.max(SAVINGS_MIN_USDC, tenPercent),
    Math.round((receivedUsdc / 2) * 100) / 100
  );
  if (slice < SAVINGS_MIN_USDC || receivedUsdc - slice < SAVINGS_MIN_USDC) {
    return null;
  }
  return Math.round(slice * 100) / 100;
}

export function projectSavings(
  principalUsdc: number,
  years = SAVINGS_HORIZON_YEARS,
  apy = SAVINGS_ILLUSTRATIVE_APY
): number {
  if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    return 0;
  }
  const value = principalUsdc * (1 + apy) ** years;
  return Math.round(value * 100) / 100;
}

export function parseSavingsReply(text: string): SavingsReply {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "other";
  }
  if (
    /^(no|nop|despues|ahora no|mejor no|dejalo|dejala|no gracias)$/.test(
      normalized
    )
  ) {
    return "decline";
  }
  if (/^(si|sip|dale|ok|okay|bueno|aparte|aparta|apartalo|ponelo|ponelos)$/.test(normalized)) {
    return "accept";
  }
  const amount = extractUsdAmount(normalized);
  if (
    amount !== null &&
    (/^(si|sip|dale|aparte|apartar|aparta|deja|dejar|ponelo|poner)\b/.test(
      normalized
    ) ||
      /^\d+(?:[.,]\d+)?$/.test(normalized))
  ) {
    return { amount };
  }
  return "other";
}
