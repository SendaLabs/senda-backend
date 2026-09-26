export function cobroWalletMsg(amount?: number): string {
  if (amount !== undefined) {
    return `Te piden ${formatCobroAmount(amount)} dolares por Senda`;
  }
  return "Te piden plata por Senda";
}

export function cobroChatCaption(
  amount?: number,
  locale: "es" | "en" = "es"
): string {
  if (locale === "en") {
    const head =
      amount !== undefined
        ? `This is your ${formatCobroAmount(amount)}-dollar charge.`
        : "This is your charge.";
    return [
      head,
      "Send this photo or the WhatsApp link below to whoever should pay you.",
      "If they scan the code, WhatsApp opens. They send that message to Senda and that's it.",
    ].join("\n");
  }
  const head =
    amount !== undefined
      ? `Este es tu cobro de ${formatCobroAmount(amount)} dólares.`
      : "Este es tu cobro.";
  return [
    head,
    "Mandale esta foto o el enlace de WhatsApp de abajo a quien te tiene que pagar.",
    "Si escanean el código, se abre WhatsApp. Mandan ese mensaje a Senda y listo.",
  ].join("\n");
}

export function formatCobroAmount(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

export function looksLikeLabReceiveCopy(text: string): boolean {
  return /send tokens to my stellar address|no memo required/i.test(text);
}

export function cobroWhatsAppPayUrl(shareUrl: string): string {
  const digits = (process.env.WHATSAPP_CLICK_TO_CHAT || "").replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(shareUrl)}`;
}

export function cobroWhatsAppShareUrl(token: string): string {
  return cobroWhatsAppPayUrl(`/c/${token}`);
}
