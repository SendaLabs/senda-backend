import type { Locale } from "./locale";

export function askAmount(locale: Locale): string {
  return locale === "en"
    ? 'How much do you want to send? You can write 10, "20 dollars" or "send 15 USDC".'
    : "¿Cuánto querés enviar? Podés escribir 10, «20 dólares» o «mandar 15 USDC».";
}

export function askMpAmount(locale: Locale): string {
  return locale === "en"
    ? 'How much do you want to move to Mercado Pago? For example 20 or "15 dollars".'
    : "¿Cuánto querés pasar a Mercado Pago? Por ejemplo 20 o «15 dólares».";
}

export function askYieldSupplyAmount(locale: Locale): string {
  return locale === "en"
    ? "How much do you want to put to work? For example 10 or \"20 dollars\"."
    : "¿Cuánto querés poner a rendir? Por ejemplo 10 o «20 dólares».";
}

export function askYieldWithdrawAmount(locale: Locale): string {
  return locale === "en"
    ? "How much do you want to take out of what's earning? For example 10."
    : "¿Cuánto querés sacar de lo que está rindiendo? Por ejemplo 10.";
}

export function askCobroAmount(locale: Locale): string {
  return locale === "en"
    ? 'How much is the charge? For example 15. If the amount doesn\'t matter, write "any".'
    : "¿De cuánto es el cobro? Por ejemplo 15. Si no importa el monto, escribí «cualquiera».";
}

export function startSendText(locale: Locale): string {
  return locale === "en"
    ? `Sure, I'll set up the transfer.\n\n${askAmount(locale)}`
    : `Dale, te armo el envío al toque.\n\n${askAmount(locale)}`;
}

export function askSendRecipientText(locale: Locale): string {
  return locale === "en"
    ? "Who should receive it, and how do I pay them? I need their phone, CVU, alias, or Senda payment link — without a real destination I can't send."
    : "¿A quién se lo mando y cómo le pago? Necesito su teléfono, CVU, alias o un link de cobro de Senda: sin un destino real no puedo enviar.";
}

export function returningGreetingText(name: string, locale: Locale): string {
  const first = name.trim().split(/\s+/)[0] || "";
  if (locale === "en") {
    return first
      ? `Hi, ${first}! You're already in. How can I help you today?`
      : "Hi! You're already in. How can I help you today?";
  }
  return first
    ? `Hola, ${first}, ¿en qué puedo ayudarte hoy?`
    : "Hola, ¿en qué puedo ayudarte hoy?";
}

export function sendMaxText(locale: Locale, max: number): string {
  return locale === "en"
    ? `For now the max per transfer is ${max} USDC. Give me another amount.`
    : `Por ahora el máximo por envío es ${max} USDC. Decime otro monto.`;
}

export function sendProcessingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `On it! Sending ${amount} USDC through Senda...`
    : `¡Listo! Procesando tu envío de ${amount} USDC a través de Senda...`;
}

export function sendDuplicateText(locale: Locale): string {
  return locale === "en"
    ? "That transfer was already credited. Ask me for your balance if you want to check."
    : "Ese envío ya lo habíamos acreditado. Pedime el saldo si querés confirmarlo.";
}

export function sendReceiptText(
  locale: Locale,
  amount: string,
  balance: string,
  proof: string
): string {
  if (locale === "en") {
    return [
      `Done 💸 We credited ${amount} USDC to your account.`,
      `You now have ${balance} USDC.`,
      proof ? `Receipt: ${proof}` : "",
      "",
      "If you want, ask me for your balance, send another amount, or move it to Mercado Pago.",
    ]
      .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
      .join("\n");
  }
  return [
    `Listo 💸 Ya acreditamos ${amount} USDC en tu cuenta.`,
    `Ahora tenés ${balance} USDC.`,
    proof ? `Comprobante: ${proof}` : "",
    "",
    "Si querés, pedime el saldo, mandá otro monto o pasalo a Mercado Pago.",
  ]
    .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
    .join("\n");
}

export function withdrawMaxText(locale: Locale, max: number): string {
  return locale === "en"
    ? `For now the max per withdrawal is ${max} dollars. Give me another amount.`
    : `Por ahora el máximo por retiro es ${max} dólares. Decime otro monto.`;
}

export function missingAmountText(locale: Locale, ask: string): string {
  return locale === "en"
    ? `I didn't see an amount in what you wrote. ${ask}`
    : `No vi un monto en lo que escribiste. ${ask}`;
}

export function balanceReadyText(locale: Locale, balance: string): string {
  return locale === "en"
    ? `You have ${balance} USDC ready to use.`
    : `Tenés ${balance} USDC listos para usar.`;
}

export function balanceYieldingText(locale: Locale, yielding: string): string {
  return locale === "en"
    ? `You also have ${yielding} set aside in savings. To move it back, write "take ${yielding} out of yield".`
    : `Además tenés ${yielding} en tu ahorro. Si los necesitás, escribí «sacar ${yielding} de rendir».`;
}

export function balanceHintText(locale: Locale): string {
  return locale === "en"
    ? 'If you want to send, write "send 10". Also: Mercado Pago, earn yield, or "create a payment link".'
    : "Si querés enviar, escribí «mandar 10». También: Mercado Pago, poner a rendir o «generame un link de cobro».";
}

export function mpProcessingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `Sure, setting up a ${amount}-dollar withdrawal to Mercado Pago...`
    : `Dale, te armo el retiro de ${amount} dólares a Mercado Pago...`;
}

export function mpReadyText(locale: Locale, url: string): string {
  return locale === "en"
    ? [
        "Done. Open this link to finish the Mercado Pago withdrawal:",
        url,
        "",
        "I'll ping you here when it's ready.",
      ].join("\n")
    : [
        "Listo. Abrí este enlace para completar el retiro en Mercado Pago:",
        url,
        "",
        "Cuando esté, te aviso por acá.",
      ].join("\n");
}

export function yieldMaxText(locale: Locale, max: number): string {
  return locale === "en"
    ? `For now the max is ${max} dollars. Give me another amount.`
    : `Por ahora el máximo es ${max} dólares. Decime otro monto.`;
}

export function yieldSupplyProcessingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `Got it, putting ${amount} dollars to work...`
    : `Perfecto, poniendo ${amount} dólares a rendir...`;
}

export function yieldSupplyReadyText(
  locale: Locale,
  amount: string,
  value: string,
  proof: string
): string {
  return locale === "en"
    ? [
        `Done. ${amount} dollars are in your savings (about ${value} now).`,
        `You can take them out whenever you need them.`,
        proof ? `Receipt: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Listo. Dejé ${amount} dólares en tu ahorro (quedaron unos ${value}).`,
        `Los podés sacar cuando los necesites.`,
        proof ? `Comprobante: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n");
}

export function yieldWithdrawProcessingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `Taking ${amount} dollars out of what's earning...`
    : `Sacando ${amount} dólares de lo que está rindiendo...`;
}

export function yieldWithdrawReadyText(
  locale: Locale,
  amount: string,
  remaining: string,
  proof: string
): string {
  return locale === "en"
    ? [
        `Done. ${amount} dollars are back in your balance.`,
        `You still have about ${remaining} dollars in savings.`,
        proof ? `Receipt: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Listo. Ya volvieron ${amount} dólares a tu saldo.`,
        `Te quedan unos ${remaining} dólares en el ahorro.`,
        proof ? `Comprobante: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n");
}

export function yieldNoneText(locale: Locale): string {
  return locale === "en"
    ? 'You don\'t have savings set aside right now. When money comes in I\'ll ask, or write "set aside 2".'
    : "Todavía no apartaste ahorro. Cuando te entre un cobro te voy a preguntar, o escribí «apartar 2».";
}

export function yieldPositionText(locale: Locale, value: string): string {
  return locale === "en"
    ? [
        `Your savings are about ${value} dollars.`,
        `That money stays available. To move it back, write "take ${value} out of yield".`,
      ].join("\n")
    : [
        `Tu ahorro está en unos ${value} dólares.`,
        `Esa plata sigue disponible. Si la necesitás, escribí «sacar ${value} de rendir».`,
      ].join("\n");
}

export function cobroBadLinkText(locale: Locale): string {
  return locale === "en"
    ? "I couldn't read that payment link. Ask the other person to send it again."
    : "No pude leer ese link de cobro. Pedile a la otra persona que te lo mande de nuevo.";
}

export function cobroOwnLinkText(locale: Locale): string {
  return locale === "en"
    ? "That payment link is yours. Send it to the other person so they can pay you."
    : "Ese link de cobro es tuyo. Mandáselo a la otra persona para que te pague.";
}

export function cobroNeedAmountText(locale: Locale): string {
  return locale === "en"
    ? "The link has no amount. How much do you want to pay? For example 10."
    : "El link no trae monto. ¿Cuánto querés pagar? Por ejemplo 10.";
}

export function cobroPayingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `Paying ${amount} dollars now...`
    : `Pago de ${amount} dólares en camino...`;
}

export function cobroPaidText(
  locale: Locale,
  amount: string,
  balance: string,
  proof: string
): string {
  return locale === "en"
    ? [
        `Done. You paid ${amount} dollars.`,
        `Your balance is now ${balance} USDC.`,
        proof ? `Receipt: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Listo. Ya pagaste ${amount} dólares.`,
        `Tu saldo ahora es ${balance} USDC.`,
        proof ? `Comprobante: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n");
}

export function cobroPayNeedAmountText(locale: Locale): string {
  return locale === "en"
    ? "I didn't see an amount. Tell me how much you want to pay, for example 10."
    : "No vi un monto. Decime cuánto querés pagar, por ejemplo 10.";
}

export function payeeReceiptCaption(locale: Locale = "es"): string {
  return locale === "en"
    ? "Money just arrived. Here's your receipt."
    : "Te llegó plata. Te dejo el comprobante.";
}

export function savingsOfferText(
  locale: Locale,
  received: string,
  slice: string,
  projected: string,
  justArrived: boolean
): string {
  if (locale === "en") {
    const lead = justArrived
      ? `${received} dollars just came in.`
      : `Of the ${received} that just landed,`;
    return [
      lead,
      `I can set aside ${slice} for your savings. If the pool stayed near 4% a year, in 5 years that would be about ${projected}. That's an estimate: the rate moves, and you can take the money out whenever you need it.`,
      `Should I set them aside? Reply "yes" or "no".`,
    ].join("\n");
  }
  const lead = justArrived
    ? `Te llegaron ${received} dólares.`
    : `De los ${received} que acaban de entrar,`;
  return [
    lead,
    `puedo apartar ${slice} para tu ahorro. Si el pool siguiera cerca del 4% al año, en 5 años serían unos ${projected}. Es una estimación: la tasa cambia, y esa plata la podés sacar cuando la necesites.`,
    `¿Los dejo en tu ahorro? Respondé «sí» o «no».`,
  ].join("\n");
}

export function savingsDeclinedText(locale: Locale): string {
  return locale === "en"
    ? "Okay. I'll leave it in your balance, ready to use."
    : "Dale. Lo dejo en tu saldo, listo para usar.";
}

export function savingsMinText(locale: Locale): string {
  return locale === "en"
    ? "The minimum to set aside is 2 dollars. Tell me another amount, or reply \"no\"."
    : "El mínimo para apartar es 2 dólares. Decime otro monto, o respondé «no».";
}

export function savingsReplyHintText(locale: Locale): string {
  return locale === "en"
    ? 'Reply "yes", "no", or an amount like 2.'
    : "Respondé «sí», «no», o un monto como 2.";
}

export function isAnyAmount(text: string): boolean {
  return /^(cualquiera|sin monto|da igual|no importa|any|whatever|doesnt matter|no amount)$/i.test(
    text
  );
}

export function cobroChatCaptionText(locale: Locale, amountLabel?: string): string {
  if (locale === "en") {
    const head =
      amountLabel !== undefined
        ? `This is your ${amountLabel}-dollar charge.`
        : "This is your charge.";
    return [
      head,
      "Send this photo or the WhatsApp link below to whoever should pay you.",
      "If they scan the code, WhatsApp opens. They send that message to Senda and that's it.",
    ].join("\n");
  }
  const head =
    amountLabel !== undefined
      ? `Este es tu cobro de ${amountLabel} dólares.`
      : "Este es tu cobro.";
  return [
    head,
    "Mandale esta foto o el enlace de WhatsApp de abajo a quien te tiene que pagar.",
    "Si escanean el código, se abre WhatsApp. Mandan ese mensaje a Senda y listo.",
  ].join("\n");
}

export function setupInviteButton(locale: Locale): string {
  return locale === "en" ? "Open my account" : "Abrir mi cuenta";
}

export function buildSetupInviteText(name: string, locale: Locale): string {
  const first = name.trim().split(/\s+/)[0] || (locale === "en" ? "hey" : "hola");
  if (locale === "en") {
    return [
      `${first}, to get started we'll open your account. It's a one-time step and takes about a minute.`,
      "",
      `Tap «${setupInviteButton(locale)}». It's from Senda.`,
      "Sign in with your email. You'll get a code, create your account, and you're done.",
      'When you see "Done", WhatsApp opens again: your account will be created.',
    ].join("\n");
  }
  return [
    `${first}, para empezar vamos a abrir tu cuenta. Es una sola vez y te lleva un minutito.`,
    "",
    `Tocá «${setupInviteButton(locale)}». Es de Senda.`,
    "Entrá con tu email. Te llega un código al correo, creás tu cuenta y listo.",
    "Cuando veas «Listo», volvés al chat: tu cuenta va a estar creada con éxito.",
  ].join("\n");
}

export function buildSetupReadyText(locale: Locale): string {
  if (locale === "en") {
    return [
      "Done! Your account is all set 💚",
      "",
      "Thanks for trusting Senda. You can ask me for whatever you need, in your own words or a voice note.",
      "",
      "How can I help?",
    ].join("\n");
  }
  return [
    "¡Listo! Tu cuenta ya está creada con éxito 💚",
    "",
    "Gracias por confiar en Senda. Ya podés pedirme lo que necesites, con tus palabras o una nota de voz.",
    "",
    "¿En qué te puedo ayudar?",
  ].join("\n");
}
