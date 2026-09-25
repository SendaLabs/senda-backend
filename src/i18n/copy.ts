import type { Locale } from "./locale";

export function askAmount(locale: Locale): string {
  return locale === "en"
    ? 'How much do you want to send? You can write 10, "20 dollars" or "send 15 USDC".'
    : "¿Cuánto querés enviar? Podés escribir 10, «20 dólares» o «mandar 15 USDC».";
}

export function askWithdrawAmount(locale: Locale): string {
  return locale === "en"
    ? 'How much cash do you want to withdraw? For example 20 or "15 dollars".'
    : "¿Cuánto querés retirar en efectivo? Por ejemplo 20 o «15 dólares».";
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
      "If you want, ask me for your balance, send another amount, cash out, or move it to Mercado Pago.",
    ]
      .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
      .join("\n");
  }
  return [
    `Listo 💸 Ya acreditamos ${amount} USDC en tu cuenta.`,
    `Ahora tenés ${balance} USDC.`,
    proof ? `Comprobante: ${proof}` : "",
    "",
    "Si querés, pedime el saldo, mandá otro monto, retiralo en efectivo o pasalo a Mercado Pago.",
  ]
    .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
    .join("\n");
}

export function withdrawMaxText(locale: Locale, max: number): string {
  return locale === "en"
    ? `For now the max per cash-out is ${max} dollars. Give me another amount.`
    : `Por ahora el máximo por retiro es ${max} dólares. Decime otro monto.`;
}

export function withdrawProcessingText(locale: Locale, amount: string): string {
  return locale === "en"
    ? `On it! Setting aside ${amount} USDC for your cash pickup...`
    : `¡Listo! Reservando ${amount} USDC para tu retiro en efectivo...`;
}

export function withdrawReadyText(
  locale: Locale,
  amount: string,
  partnerLabel: string,
  pickupCode: string,
  locationHint: string,
  proof: string,
  remaining: string
): string {
  if (locale === "en") {
    return [
      `Done 💵 We set aside ${amount} dollars for you to pick up.`,
      "",
      `Network: ${partnerLabel}`,
      `Code: ${pickupCode}`,
      locationHint,
      "Bring your ID. The code is good for 48 hours.",
      proof ? `Receipt: ${proof}` : "",
      "",
      `Your balance is now ${remaining} USDC.`,
    ]
      .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
      .join("\n");
  }
  return [
    `Listo 💵 Ya dejamos aparte ${amount} dólares para que los retires.`,
    "",
    `Red: ${partnerLabel}`,
    `Código: ${pickupCode}`,
    locationHint,
    "Llevá tu documento. El código vale 48 horas.",
    proof ? `Comprobante: ${proof}` : "",
    "",
    `Tu saldo ahora es ${remaining} USDC.`,
  ]
    .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
    .join("\n");
}

export function withdrawInsufficientText(
  locale: Locale,
  requested: string,
  available: string
): string {
  return locale === "en"
    ? `You don't have enough to withdraw ${requested} dollars. You currently have ${available} USDC.`
    : `No te alcanza el saldo para retirar ${requested} dólares. Ahora tenés ${available} USDC.`;
}

export function withdrawAmountPickedText(locale: Locale, amount: string, prompt: string): string {
  return locale === "en"
    ? `Got it, cash-out of ${amount} dollars.\n\n${prompt}`
    : `Perfecto, retiro de ${amount} dólares.\n\n${prompt}`;
}

export function withdrawStartWithPartnerText(locale: Locale, ask: string): string {
  return locale === "en" ? `Sure, I'll set up the cash-out. ${ask}` : `Dale, te armo el retiro. ${ask}`;
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
    ? `You also have ${yielding} earning yield. If you want it back, write "take ${yielding} out of yield".`
    : `Además tenés ${yielding} rindiendo. Si los querés de vuelta, escribí «sacar ${yielding} de rendir».`;
}

export function balanceHintText(locale: Locale): string {
  return locale === "en"
    ? 'If you want to send, write "send 10". For cash, "withdraw 15 at MoneyGram". Also: Mercado Pago, earn yield, or "create a payment link".'
    : "Si querés enviar, escribí «mandar 10». Si querés efectivo, «retirar 15 en MoneyGram». También: Mercado Pago, poner a rendir o «generame un link de cobro».";
}

export function withdrawNoneText(locale: Locale): string {
  return locale === "en"
    ? 'You don\'t have a pending cash-out. If you want cash, write "withdraw 20 at MoneyGram".'
    : "No tenés un retiro pendiente. Si querés efectivo, escribí «retirar 20 en MoneyGram».";
}

export function withdrawPendingText(
  locale: Locale,
  amount: string,
  partnerLabel: string,
  pickupCode: string,
  locationHint: string
): string {
  return locale === "en"
    ? [
        `Your ${amount}-dollar cash-out is still pending.`,
        `Network: ${partnerLabel}`,
        `Code: ${pickupCode}`,
        locationHint,
      ].join("\n")
    : [
        `Tu retiro de ${amount} dólares sigue pendiente.`,
        `Red: ${partnerLabel}`,
        `Código: ${pickupCode}`,
        locationHint,
      ].join("\n");
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
        `Done 📈 ${amount} dollars are now earning yield.`,
        `That's about ${value} dollars in the pool.`,
        proof ? `Receipt: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Listo 📈 Ya dejamos ${amount} dólares rindiendo.`,
        `Ahí tenés aproximadamente ${value} dólares.`,
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
        `You still have about ${remaining} dollars earning yield.`,
        proof ? `Receipt: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `Listo. Ya volvieron ${amount} dólares a tu saldo.`,
        `Te quedan aproximadamente ${remaining} dólares rindiendo.`,
        proof ? `Comprobante: ${proof}` : "",
      ]
        .filter(Boolean)
        .join("\n");
}

export function yieldNoneText(locale: Locale): string {
  return locale === "en"
    ? 'You don\'t have money earning yield right now. If you want to start, write "put 5 to work".'
    : "No tenés plata rindiendo ahora. Si querés poner, escribí «poner 5 a rendir».";
}

export function yieldPositionText(locale: Locale, value: string): string {
  return locale === "en"
    ? [
        `What you left earning is now worth about ${value} dollars.`,
        `That's your share of a shared Senda pool. To move it back to your balance, write "take ${value} out of yield".`,
      ].join("\n")
    : [
        `Lo que dejaste rindiendo ahora vale unos ${value} dólares.`,
        `Es tu parte de un pozo compartido de Senda. Si querés volver a tu saldo, escribí «sacar ${value} de rendir».`,
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

export function isAnyAmount(text: string): boolean {
  return /^(cualquiera|sin monto|da igual|no importa|any|whatever|doesnt matter|no amount)$/i.test(
    text
  );
}

export function partnerPromptText(locale: Locale): string {
  return locale === "en"
    ? [
        "Where do you want to pick up the cash?",
        "• MoneyGram",
        "• A shop on the Senda network",
        "• Western Union",
      ].join("\n")
    : [
        "¿Dónde querés retirar el efectivo?",
        "• MoneyGram",
        "• Un comercio de la red Senda",
        "• Western Union",
      ].join("\n");
}

export function cobroChatCaptionText(locale: Locale, amountLabel?: string): string {
  if (locale === "en") {
    const head =
      amountLabel !== undefined
        ? `This is your ${amountLabel}-dollar charge.`
        : "This is your charge.";
    return [
      head,
      "Send this photo or the link below to whoever should pay you.",
      "If they scan the code, a Senda page opens. If they also use the chat, they can paste the link.",
    ].join("\n");
  }
  const head =
    amountLabel !== undefined
      ? `Este es tu cobro de ${amountLabel} dólares.`
      : "Este es tu cobro.";
  return [
    head,
    "Mandale esta foto o el enlace de abajo a quien te tiene que pagar.",
    "Si escanean el código, se abre una página de Senda. Si también usan el chat, que peguen el enlace.",
  ].join("\n");
}

export function buildSetupInviteText(name: string, url: string, locale: Locale): string {
  const first = name.trim().split(/\s+/)[0] || (locale === "en" ? "hey" : "hola");
  if (locale === "en") {
    return [
      `${first}, to get started we'll open your account. It's a one-time step and takes about a minute.`,
      "",
      "Tap this link (it's from Senda and lasts 30 minutes):",
      url,
      "",
      "Sign in with your email. You'll get a code, create your account, and you're done.",
      'When you see "Done", you can come back: your account will be created.',
    ].join("\n");
  }
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
