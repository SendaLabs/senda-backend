export type UserIntent =
  | { type: "balance" }
  | { type: "send"; amount: number | null }
  | { type: "menu" }
  | { type: "option"; option: "1" | "2" }
  | { type: "unknown" };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿?¡!.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BALANCE_RE =
  /\b(saldo|balance|fondos|plata|dinero|usdc)\b|\b(cuanto|cuanta)\s+(tengo|me\s+queda|hay|tengo\s+de)\b|\b(ver|consultar|mostrar|chequear|revisar)\s+(el\s+)?(saldo|plata|fondos|balance|dinero|usdc)\b|\b(mi|mis)\s+(saldo|plata|fondos|usdc)\b/;

const SEND_RE =
  /\b(enviar|enviame|mandar|mandame|retirar|retirame|recibir|recibirme|transferir|acreditar|sacar|extraer|pagar|depositar)\b/;

const MENU_RE =
  /^(menu|hola|buenas|buen\s+dia|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|inicio|empezar|start|ayuda|help)$/;

const OPTION_RE = /^(1|2|1️⃣|2️⃣)$/;

function extractAmount(text: string): number | null {
  const match = normalize(text).match(
    /(\d+(?:[.,]\d+)?)\s*(?:usdc|usd|dolares|dolar|dlls)?/
  );
  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

export function classifyIntent(text: string): UserIntent {
  const raw = text.trim();
  const normalized = normalize(raw);

  if (!normalized) {
    return { type: "unknown" };
  }

  if (OPTION_RE.test(raw.trim()) || OPTION_RE.test(normalized)) {
    const option = normalized.includes("2") ? "2" : "1";
    return { type: "option", option };
  }

  if (MENU_RE.test(normalized)) {
    return { type: "menu" };
  }

  const hasBalance = BALANCE_RE.test(normalized);
  const hasSend = SEND_RE.test(normalized);
  const amount = extractAmount(normalized);

  if (hasSend && hasBalance) {
    if (amount !== null) {
      return { type: "send", amount };
    }
    if (/\b(saldo|cuanto|balance)\b/.test(normalized)) {
      return { type: "balance" };
    }
    return { type: "send", amount: null };
  }

  if (hasSend) {
    return { type: "send", amount };
  }

  if (hasBalance) {
    return { type: "balance" };
  }

  if (amount !== null && /usdc|usd|dolar/.test(normalized)) {
    return { type: "send", amount };
  }

  return { type: "unknown" };
}
