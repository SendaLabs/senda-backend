import type { OfframpPartnerId } from "./offramp.store";
import { extractPartner } from "./offramp.partners";

export type UserIntent =
  | { type: "balance" }
  | { type: "send"; amount: number | null }
  | { type: "withdraw"; amount: number | null; partner: OfframpPartnerId | null }
  | { type: "withdraw_status" }
  | { type: "menu" }
  | { type: "option"; option: "1" | "2" }
  | { type: "unknown" };

const MAX_PLAUSIBLE_USDC = 500;

const WORD_AMOUNTS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
};

const SEND_VERBS =
  "enviar|enviame|enviale|envio|enviarle|mandar|mandame|mandale|mandarle|transferir|transferime|acreditar|pagar|depositar|pasar|pasame|pasale|recargar|remesar|remesa|girar|girame";

const WITHDRAW_VERBS =
  "retirar|retirame|retiro|sacar|sacame|extraer|cobrar|cobrame|cashout|offramp";

const CASH_RE =
  /\b(efectivo|cash|moneygram|money\s*gram|western\s*union|\bwu\b|comercio|sucursal|kiosco)\b/;

const WITHDRAW_STATUS_RE =
  /\b(mi\s+codigo|codigo\s+de\s+retiro|donde\s+retiro|donde\s+cobro|mi\s+retiro|orden\s+de\s+retiro)\b/;

const CURRENCY = "usdc|usd|dolares|dolar|dlls|bucks";

const BALANCE_RE = new RegExp(
  [
    String.raw`\b(saldo|balance|fondos)\b`,
    String.raw`\b(cuanto|cuanta|cuantos|cuantas)\b`,
    String.raw`\b(ver|consultar|mostrar|chequear|revisar|dame|decime|mostrame)\s+(el\s+|la\s+|mi\s+|mis\s+|los\s+|las\s+)?(saldo|plata|fondos|balance|dinero|usdc|dolares|dolar)\b`,
    String.raw`\b(mi|mis)\s+(saldo|plata|fondos|usdc|dolares|dinero)\b`,
    String.raw`\b(tengo|hay)\s+(saldo|plata|usdc|dolares|dinero|fondos)\b`,
    String.raw`\b(ver|consultar|mostrar|chequear)\s+mis\s+usdc\b`,
    String.raw`\bme\s+queda\b`,
  ].join("|")
);

const SEND_RE = new RegExp(String.raw`\b(${SEND_VERBS})\b`);
const WITHDRAW_RE = new RegExp(String.raw`\b(${WITHDRAW_VERBS})\b`);

const WANT_RE =
  /\b(quiero|queria|quiero\s+hacer|necesito|me\s+gustaria|podrias|podes|puedo|vamos\s+a)\b/;

const MENU_RE =
  /^(menu|hola|holis|buenas|buen\s+dia|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|inicio|empezar|start|ayuda|help|que\s+tal|como\s+estas)$/;

const OPTION_RE = /^(1|2|1️⃣|2️⃣)$/;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿?¡!.,;:()'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAmount(raw: string): number | null {
  const amount = Number(raw.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (amount > MAX_PLAUSIBLE_USDC) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

function isPlausibleNumericToken(raw: string): boolean {
  const digits = raw.replace(/[.,]/g, "");
  if (digits.length >= 8) {
    return false;
  }
  const asNumber = Number(raw.replace(",", "."));
  if (!Number.isFinite(asNumber)) {
    return false;
  }
  if (digits.length === 4 && asNumber >= 1900 && asNumber <= 2099) {
    return false;
  }
  return asNumber > 0 && asNumber <= MAX_PLAUSIBLE_USDC;
}

function extractWordAmount(normalized: string): number | null {
  const words = Object.keys(WORD_AMOUNTS).sort((a, b) => b.length - a.length);
  for (const word of words) {
    const actionVerbs = `${SEND_VERBS}|${WITHDRAW_VERBS}`;
    if (word === "un" || word === "una" || word === "uno") {
      const withUnit = new RegExp(
        String.raw`\b${word}\b(?:\s+(?:${CURRENCY}|${actionVerbs}))`
      );
      if (withUnit.test(normalized)) {
        return WORD_AMOUNTS[word];
      }
      continue;
    }

    const nearHint = new RegExp(
      String.raw`(?:\b(?:${actionVerbs}|${CURRENCY}|quiero|necesito)\b\s+)?\b${word}\b(?:\s+(?:${CURRENCY}))?`
    );
    if (
      nearHint.test(normalized) &&
      new RegExp(
        String.raw`\b(?:${actionVerbs}|${CURRENCY}|quiero|necesito)\b`
      ).test(normalized) &&
      new RegExp(String.raw`\b${word}\b`).test(normalized)
    ) {
      return WORD_AMOUNTS[word];
    }
  }
  return null;
}

export function extractUsdAmount(text: string): number | null {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  const withCurrency = [
    ...normalized.matchAll(
      new RegExp(
        String.raw`(?:\$)?(\d+(?:[.,]\d+)?)\s*(?:${CURRENCY})\b|(?:${CURRENCY}|\$)\s*(\d+(?:[.,]\d+)?)`,
        "g"
      )
    ),
  ];
  for (const match of withCurrency) {
    const token = match[1] ?? match[2];
    if (!token || !isPlausibleNumericToken(token)) {
      continue;
    }
    const amount = toAmount(token);
    if (amount !== null) {
      return amount;
    }
  }

  const afterVerb = normalized.match(
    new RegExp(
      String.raw`\b(?:${SEND_VERBS}|${WITHDRAW_VERBS})\b(?:\s+\w+){0,3}\s+(\d+(?:[.,]\d+)?)`
    )
  );
  if (afterVerb?.[1] && isPlausibleNumericToken(afterVerb[1])) {
    const amount = toAmount(afterVerb[1]);
    if (amount !== null) {
      return amount;
    }
  }

  const beforeVerb = normalized.match(
    new RegExp(
      String.raw`(\d+(?:[.,]\d+)?)\s*(?:${CURRENCY})?\s+\b(?:${SEND_VERBS}|${WITHDRAW_VERBS})\b`
    )
  );
  if (beforeVerb?.[1] && isPlausibleNumericToken(beforeVerb[1])) {
    const amount = toAmount(beforeVerb[1]);
    if (amount !== null) {
      return amount;
    }
  }

  const wordAmount = extractWordAmount(normalized);
  if (wordAmount !== null) {
    return wordAmount;
  }

  const numbers = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)/g)]
    .map((match) => match[1])
    .filter((token): token is string => Boolean(token && isPlausibleNumericToken(token)));

  if (numbers.length === 1) {
    return toAmount(numbers[0]);
  }

  if (numbers.length > 1) {
    return toAmount(numbers[0]);
  }

  return null;
}

export function hasSendVerb(text: string): boolean {
  return SEND_RE.test(normalizeText(text));
}

export function classifyIntent(text: string): UserIntent {
  const raw = text.trim();
  const normalized = normalizeText(raw);

  if (!normalized) {
    return { type: "unknown" };
  }

  if (OPTION_RE.test(raw) || OPTION_RE.test(normalized)) {
    const option = normalized.includes("2") ? "2" : "1";
    return { type: "option", option };
  }

  if (MENU_RE.test(normalized)) {
    return { type: "menu" };
  }

  const hasBalance = BALANCE_RE.test(normalized);
  const hasSend = SEND_RE.test(normalized);
  const hasWithdraw =
    WITHDRAW_RE.test(normalized) || CASH_RE.test(normalized);
  const wantsAction = WANT_RE.test(normalized);
  const amount = extractUsdAmount(normalized);
  const partner = extractPartner(normalized);

  if (WITHDRAW_STATUS_RE.test(normalized)) {
    return { type: "withdraw_status" };
  }

  if (hasWithdraw && hasBalance && amount === null) {
    return { type: "balance" };
  }

  if (hasWithdraw && !hasSend) {
    return { type: "withdraw", amount, partner };
  }

  if (hasBalance && !hasSend) {
    return { type: "balance" };
  }

  if (hasSend && hasBalance) {
    if (amount !== null) {
      return { type: "send", amount };
    }
    if (/\b(saldo|cuanto|cuantos|balance|tengo)\b/.test(normalized)) {
      return { type: "balance" };
    }
    return { type: "send", amount: null };
  }

  if (hasSend) {
    return { type: "send", amount };
  }

  if (wantsAction && amount !== null && !hasBalance) {
    return { type: "send", amount };
  }

  if (amount !== null) {
    return { type: "send", amount };
  }

  return { type: "unknown" };
}
