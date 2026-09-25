export function cobroWalletMsg(amount?: number): string {
  if (amount !== undefined) {
    return `Te piden ${formatCobroAmount(amount)} dolares por Senda`;
  }
  return "Te piden plata por Senda";
}

export function cobroChatCaption(amount?: number): string {
  const head =
    amount !== undefined
      ? `Este es tu cobro de ${formatCobroAmount(amount)} dólares.`
      : "Este es tu cobro.";
  return [
    head,
    "Mandale esta foto o el enlace de abajo a quien te tiene que pagar.",
    "Si también usa Senda, que pegue el enlace en el chat.",
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
