import {
  ConversationStep,
  getSession,
  setSession,
} from "./session.service";
import {
  classifyIntent,
  extractUsdAmount,
  hasSendVerb,
  normalizeText,
} from "./intent.service";
import { humanizeLedgerError } from "./ledger-error.service";
import { creditUserOnTestnet, getUserOnChainState } from "./stellar.service";
import {
  createCashWithdrawal,
  extractPartner,
  getOpenCashWithdrawal,
  getSpendableUsdc,
  OfframpInsufficientFundsError,
  partnerPrompt,
  type OfframpPartnerId,
} from "./offramp.service";
import {
  logSafeError,
  sendWhatsAppMessage,
  sendWhatsAppVideo,
  WELCOME_MENU_TEXT,
  WELCOME_VIDEO_CAPTION,
  WELCOME_VIDEO_URL,
} from "./whatsapp.service";

const ASK_AMOUNT =
  "¿Cuánto querés enviar? Podés escribir 10, «20 dólares» o «mandar 15 USDC».";

const ASK_WITHDRAW_AMOUNT =
  "¿Cuánto querés retirar en efectivo? Por ejemplo 20 o «15 dólares».";

const MAX_USDC_PER_SEND = 500;

function isGreeting(text: string): boolean {
  return /^(hola+|holis|buenas|buen\s+dia|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|que\s+tal|como\s+estas)$/.test(
    normalizeText(text)
  );
}

function formatUsdcLabel(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

function guideUser(name: string): string {
  return [
    `${name}, ¿en qué te ayudo?`,
    "Podés pedirme el saldo, armar un envío («quiero mandar 20 dólares») o retirar efectivo («retirar 15 en MoneyGram»).",
  ].join("\n");
}

function idleSession(
  name: string,
  extras?: { pendingAmount?: number; pendingPartner?: OfframpPartnerId }
) {
  return {
    step: ConversationStep.AWAITING_MENU_OPTION,
    name,
    ...extras,
  };
}

async function sendMenu(to: string, name: string): Promise<void> {
  await sendWhatsAppMessage(to, WELCOME_MENU_TEXT);
  setSession(to, idleSession(name));
}

export async function sendWelcomeFlow(to: string, name: string): Promise<void> {
  try {
    await sendWhatsAppVideo(to, WELCOME_VIDEO_URL, WELCOME_VIDEO_CAPTION);
  } catch (error) {
    logSafeError("Webhook: no se pudo enviar el video de bienvenida", error);
  }

  await sendMenu(to, name);
}

async function startSendFlow(to: string, name: string): Promise<void> {
  setSession(to, { step: ConversationStep.AWAITING_USD_AMOUNT, name });
  await sendWhatsAppMessage(
    to,
    `Dale, te armo el envío al toque.\n\n${ASK_AMOUNT}`
  );
}

async function startWithdrawFlow(
  to: string,
  name: string,
  amount: number | null,
  partner: OfframpPartnerId | null
): Promise<void> {
  if (amount !== null && partner) {
    await executeCashWithdrawal(to, name, amount, partner);
    return;
  }

  if (amount !== null) {
    setSession(to, {
      step: ConversationStep.AWAITING_WITHDRAW_PARTNER,
      name,
      pendingAmount: amount,
    });
    await sendWhatsAppMessage(
      to,
      `Perfecto, retiro de ${formatUsdcLabel(amount)} dólares.\n\n${partnerPrompt()}`
    );
    return;
  }

  setSession(to, {
    step: ConversationStep.AWAITING_WITHDRAW_AMOUNT,
    name,
    pendingPartner: partner ?? undefined,
  });
  await sendWhatsAppMessage(
    to,
    partner
      ? `Dale, te armo el retiro. ${ASK_WITHDRAW_AMOUNT}`
      : ASK_WITHDRAW_AMOUNT
  );
}

async function executeUsdcTransfer(
  to: string,
  name: string,
  usdAmount: number
): Promise<void> {
  if (usdAmount > MAX_USDC_PER_SEND) {
    setSession(to, { step: ConversationStep.AWAITING_USD_AMOUNT, name });
    await sendWhatsAppMessage(
      to,
      `Por ahora el máximo por envío es ${MAX_USDC_PER_SEND} USDC. Decime otro monto.`
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    `¡Listo! Procesando tu envío de ${formatUsdcLabel(usdAmount)} USDC a través de Senda...`
  );

  try {
    const result = await creditUserOnTestnet(to, usdAmount);
    setSession(to, idleSession(name));

    await sendWhatsAppMessage(
      to,
      [
        `Listo 💸 Ya acreditamos ${result.amountUsdc} USDC en tu cuenta.`,
        `Ahora tenés ${result.usdcBalance} USDC.`,
        "",
        "Si querés, pedime el saldo, mandá otro monto o retiralo en efectivo.",
      ].join("\n")
    );
  } catch (error) {
    logSafeError("Error al acreditar", error);
    setSession(to, { step: ConversationStep.AWAITING_USD_AMOUNT, name });
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function executeCashWithdrawal(
  to: string,
  name: string,
  amount: number,
  partner: OfframpPartnerId
): Promise<void> {
  if (amount > MAX_USDC_PER_SEND) {
    setSession(to, {
      step: ConversationStep.AWAITING_WITHDRAW_AMOUNT,
      name,
      pendingPartner: partner,
    });
    await sendWhatsAppMessage(
      to,
      `Por ahora el máximo por retiro es ${MAX_USDC_PER_SEND} dólares. Decime otro monto.`
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    `¡Listo! Reservando ${formatUsdcLabel(amount)} USDC para tu retiro en efectivo...`
  );

  try {
    const order = await createCashWithdrawal(to, amount, partner);
    const remaining = await getSpendableUsdc(to);
    setSession(to, idleSession(name));

    await sendWhatsAppMessage(
      to,
      [
        `Listo 💵 Ya dejamos aparte ${order.amountUsdc} dólares para que los retires.`,
        "",
        `Red: ${order.partnerLabel}`,
        `Código: ${order.pickupCode}`,
        order.locationHint,
        "Llevá tu documento. El código vale 48 horas.",
        "",
        `Tu saldo ahora es ${remaining} USDC.`,
      ].join("\n")
    );
  } catch (error) {
    logSafeError("Error en retiro en efectivo", error);
    setSession(to, idleSession(name));

    if (error instanceof OfframpInsufficientFundsError) {
      await sendWhatsAppMessage(
        to,
        `No te alcanza el saldo para retirar ${formatUsdcLabel(error.requested)} dólares. Ahora tenés ${error.available} USDC.`
      );
      return;
    }

    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function handleUsdAmount(
  to: string,
  name: string,
  text: string
): Promise<void> {
  const usdAmount = extractUsdAmount(text);
  if (usdAmount === null) {
    await sendWhatsAppMessage(
      to,
      `No vi un monto en lo que escribiste. ${ASK_AMOUNT}`
    );
    return;
  }

  await executeUsdcTransfer(to, name, usdAmount);
}

async function handleBalanceQuery(to: string, name: string): Promise<void> {
  setSession(to, idleSession(name));

  try {
    const state = await getUserOnChainState(to);
    const balance = state.usdcBalance ?? "0";
    await sendWhatsAppMessage(
      to,
      [
        `Tenés ${balance} USDC listos para usar.`,
        "",
        "Si querés enviar, escribí «mandar 10». Si querés efectivo, «retirar 15 en MoneyGram».",
      ].join("\n")
    );
  } catch (error) {
    logSafeError("Error al consultar saldo", error);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function handleWithdrawStatus(to: string, name: string): Promise<void> {
  setSession(to, idleSession(name));
  const order = getOpenCashWithdrawal(to);
  if (!order) {
    await sendWhatsAppMessage(
      to,
      "No tenés un retiro pendiente. Si querés efectivo, escribí «retirar 20 en MoneyGram»."
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    [
      `Tu retiro de ${order.amountUsdc} dólares sigue pendiente.`,
      `Red: ${order.partnerLabel}`,
      `Código: ${order.pickupCode}`,
      order.locationHint,
    ].join("\n")
  );
}

async function dispatchIntent(
  to: string,
  name: string,
  text: string
): Promise<void> {
  const intent = classifyIntent(text);

  switch (intent.type) {
    case "balance":
      await handleBalanceQuery(to, name);
      return;
    case "send":
      if (intent.amount !== null) {
        await executeUsdcTransfer(to, name, intent.amount);
        return;
      }
      await startSendFlow(to, name);
      return;
    case "withdraw":
      await startWithdrawFlow(to, name, intent.amount, intent.partner);
      return;
    case "withdraw_status":
      await handleWithdrawStatus(to, name);
      return;
    case "option":
      if (intent.option === "2") {
        await handleBalanceQuery(to, name);
        return;
      }
      await startSendFlow(to, name);
      return;
    case "menu":
      if (isGreeting(text)) {
        await sendWelcomeFlow(to, name);
        return;
      }
      await sendMenu(to, name);
      return;
    case "unknown":
      await sendWhatsAppMessage(to, guideUser(name));
      return;
  }
}

export async function handleIncomingWhatsAppMessage(
  from: string,
  name: string,
  text: string
): Promise<void> {
  const session = getSession(from);
  const intent = classifyIntent(text);

  if (!session) {
    if (intent.type === "unknown" || intent.type === "menu") {
      await sendWelcomeFlow(from, name);
      return;
    }

    setSession(from, idleSession(name));
    await dispatchIntent(from, name, text);
    return;
  }

  if (
    intent.type === "balance" ||
    intent.type === "menu" ||
    intent.type === "withdraw_status"
  ) {
    await dispatchIntent(from, session.name, text);
    return;
  }

  if (session.step === ConversationStep.AWAITING_USD_AMOUNT) {
    if (intent.type === "withdraw") {
      await startWithdrawFlow(
        from,
        session.name,
        intent.amount,
        intent.partner
      );
      return;
    }

    if (intent.type === "send" && intent.amount !== null) {
      await executeUsdcTransfer(from, session.name, intent.amount);
      return;
    }

    await handleUsdAmount(from, session.name, text);
    return;
  }

  if (session.step === ConversationStep.AWAITING_WITHDRAW_AMOUNT) {
    if (intent.type === "send" && intent.amount !== null && hasSendVerb(text)) {
      await executeUsdcTransfer(from, session.name, intent.amount);
      return;
    }

    const amount = intent.type === "withdraw" ? intent.amount : extractUsdAmount(text);
    const partner =
      (intent.type === "withdraw" ? intent.partner : null) ??
      extractPartner(text) ??
      session.pendingPartner ??
      null;

    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        `No vi un monto en lo que escribiste. ${ASK_WITHDRAW_AMOUNT}`
      );
      return;
    }

    await startWithdrawFlow(from, session.name, amount, partner);
    return;
  }

  if (session.step === ConversationStep.AWAITING_WITHDRAW_PARTNER) {
    if (intent.type === "send" && intent.amount !== null && hasSendVerb(text)) {
      await executeUsdcTransfer(from, session.name, intent.amount);
      return;
    }

    const amount =
      (intent.type === "withdraw" ? intent.amount : null) ??
      session.pendingAmount ??
      extractUsdAmount(text);
    const partner =
      (intent.type === "withdraw" ? intent.partner : null) ??
      extractPartner(text);

    if (!partner) {
      await sendWhatsAppMessage(from, partnerPrompt());
      return;
    }

    if (amount === null) {
      await startWithdrawFlow(from, session.name, null, partner);
      return;
    }

    await executeCashWithdrawal(from, session.name, amount, partner);
    return;
  }

  await dispatchIntent(from, session.name, text);
}
