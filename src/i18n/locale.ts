export type Locale = "es" | "en";

const EN_GREETING =
  /^(hello+|hi+|hey|good\s+morning|good\s+afternoon|good\s+evening|how\s+are\s+you|what'?s\s+up)(\s+senda)?$/;

const ES_GREETING =
  /^(hola+|holis|buenas|buen\s+dia|buenos\s+dias|buenas\s+tardes|buenas\s+noches|que\s+tal|como\s+estas)(\s+senda)?$/;

export function normalizeLocaleText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿?¡!.,;:()'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EN_MARKERS =
  /\b(the|you|your|please|want|need|send|sending|withdraw|balance|dollars?|help|can|could|would|i'm|i\s+am|what'?s|how\s+much|cash\s+out|payment\s+link|hello|hi|hey|good\s+morning)\b/;

const ES_MARKERS =
  /\b(hola|holis|quiero|necesito|mandar|enviar|saldo|cuanto|por\s+favor|retirar|dolares|ayuda|rendir|cobro|buenas)\b/;

export function detectLocale(text: string): Locale | null {
  const normalized = normalizeLocaleText(text);
  if (EN_GREETING.test(normalized)) {
    return "en";
  }
  if (ES_GREETING.test(normalized)) {
    return "es";
  }
  return null;
}

/** Saludo o frase clara. Sirve para texto y para notas de voz transcritas. */
export function inferLocale(text: string): Locale | null {
  const greeting = detectLocale(text);
  if (greeting) {
    return greeting;
  }
  const normalized = normalizeLocaleText(text);
  if (!normalized) {
    return null;
  }
  const en = EN_MARKERS.test(normalized);
  const es = ES_MARKERS.test(normalized);
  if (en && !es) {
    return "en";
  }
  if (es && !en) {
    return "es";
  }
  return null;
}

export function isGreeting(text: string): boolean {
  return detectLocale(text) !== null;
}

function firstName(name?: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function welcomeVideoCaption(
  name?: string,
  locale: Locale = "es"
): string {
  const first = firstName(name);
  if (locale === "en") {
    const hello = first ? `Hi, ${first}!` : "Hi!";
    return `${hello} So glad you're here 💚 I'm Senda. I can help you send, receive and take care of your dollars — no rush, no jargon.`;
  }
  const hello = first ? `¡Hola, ${first}!` : "¡Hola!";
  return `${hello} Qué bueno tenerte acá 💚 Soy Senda. Estoy para acompañarte a mandar, recibir y cuidar tus dólares, sin apuro y sin vueltas.`;
}

export function welcomeMenuText(name?: string, locale: Locale = "es"): string {
  const first = firstName(name);
  if (locale === "en") {
    const opener = first ? `${first}, how can I help?` : "How can I help?";
    return [
      opener,
      "",
      "You can type or send a voice note, like you're talking to a friend. No commands needed.",
      "",
      "Tell me what you need: check your balance, send dollars, cash out, move money to Mercado Pago, earn yield, or create a payment link.",
      "",
      "I'll walk you through it, no rush.",
    ].join("\n");
  }
  const opener = first
    ? `${first}, ¿en qué te puedo ayudar?`
    : "¿En qué te puedo ayudar?";
  return [
    opener,
    "",
    "Podés escribirme o mandarme una nota de voz, como si me hablaras. No hace falta ningún comando.",
    "",
    "Decime lo que necesites: ver tu saldo, mandar dólares, sacar efectivo, pasarlos a Mercado Pago, dejarlos rindiendo o armar un cobro.",
    "",
    "Yo te voy guiando, sin apuro.",
  ].join("\n");
}
