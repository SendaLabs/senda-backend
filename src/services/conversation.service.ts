import { maybeInviteWalletSetup } from "../wallet/wallet-setup";
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
import { clearPendingAck, getPendingAck, savePendingAck } from "./pending-ack.store";
import {
  beginCreditClaim,
  finishCreditClaim,
  withPhoneLock,
} from "./operation-guard.service";
import {
  creditUserOnTestnet,
  explorerTxUrl,
  getOrCreateUserAccount,
  getUserOnChainState,
} from "./stellar.service";
import { transferUsdcFromWallet } from "./usdc.service";
import { cobroChatCaption } from "../qr/cobro-copy";
import { cobroPublicUrl, extractCobroToken, issueCobro, peekCobro } from "../qr/cobro.store";
import {
  buildSendaCobroUri,
  parseSep7PayUri,
  renderSep7QrPng,
} from "../qr/sep7";
import {
  createCashWithdrawal,
  extractPartner,
  getOpenCashWithdrawal,
  getSpendableUsdc,
  OfframpInsufficientFundsError,
  partnerPrompt,
  type OfframpPartnerId,
} from "./offramp.service";
import { startMercadoPagoWithdraw } from "./sep24-withdraw.service";
import {
  deposit as supplyToBlend,
  getPosition as getBlendPosition,
  withdraw as withdrawFromBlend,
  YieldDepositsBlockedError,
} from "../yield/savings-service";
import { isPositiveUsdcAmount } from "../yield/yield-book";
import {
  logSafeError,
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendWhatsAppVideo,
  welcomeMenuText,
  welcomeVideoCaption,
  getWelcomeVideoUrl,
} from "./whatsapp.service";

let currentMessageId: string | undefined;

const ASK_AMOUNT =
  "¿Cuánto querés enviar? Podés escribir 10, «20 dólares» o «mandar 15 USDC».";

const ASK_WITHDRAW_AMOUNT =
  "¿Cuánto querés retirar en efectivo? Por ejemplo 20 o «15 dólares».";

const ASK_MP_AMOUNT =
  "¿Cuánto querés pasar a Mercado Pago? Por ejemplo 20 o «15 dólares».";

const ASK_YIELD_SUPPLY_AMOUNT =
  "¿Cuánto querés poner a rendir? Por ejemplo 10 o «20 dólares».";

const ASK_YIELD_WITHDRAW_AMOUNT =
  "¿Cuánto querés sacar de lo que está rindiendo? Por ejemplo 10.";

const ASK_COBRO_AMOUNT =
  "¿De cuánto es el cobro? Por ejemplo 15. Si no importa el monto, escribí «cualquiera».";

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
  return welcomeMenuText(name);
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
  await sendWhatsAppMessage(to, welcomeMenuText(name));
  setSession(to, idleSession(name));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWelcomeVideoOrCaption(
  to: string,
  caption: string
): Promise<void> {
  try {
    await sendWhatsAppVideo(to, getWelcomeVideoUrl(), caption);
  } catch (error) {
    logSafeError("Webhook: no se pudo enviar el video de bienvenida", error);
    try {
      await sendWhatsAppMessage(to, caption);
    } catch (captionError) {
      logSafeError("Webhook: tampoco pude mandar el texto del video", captionError);
    }
  }
}

export async function sendWelcomeFlow(to: string, name: string): Promise<void> {
  const caption = welcomeVideoCaption(name);
  await sendWelcomeVideoOrCaption(to, caption);
  // WhatsApp entrega el texto antes que el video si van pegados.
  await sleep(2800);
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
  const messageId = currentMessageId;
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
    const result = await withPhoneLock(to, async () => {
      if (messageId) {
        const claim = await beginCreditClaim(messageId, to, usdAmount);
        if (claim.status === "duplicate") {
          return {
            amountUsdc: String(usdAmount),
            usdcBalance: await getSpendableUsdc(to),
            duplicate: true,
            txHash: claim.txHash,
          };
        }
      }

      const credited = await creditUserOnTestnet(to, usdAmount);
      if (messageId) {
        await finishCreditClaim(messageId, credited.usdcTxHash);
      }
      return {
        amountUsdc: credited.amountUsdc,
        usdcBalance: credited.usdcBalance,
        duplicate: false,
        txHash: credited.usdcTxHash,
      };
    });
    setSession(to, idleSession(name));

    const proof =
      result.txHash && !result.duplicate ? explorerTxUrl(result.txHash) : "";
    const receipt = result.duplicate
      ? "Ese envío ya lo habíamos acreditado. Pedime el saldo si querés confirmarlo."
      : [
          `Listo 💸 Ya acreditamos ${result.amountUsdc} USDC en tu cuenta.`,
          `Ahora tenés ${result.usdcBalance} USDC.`,
          proof ? `Comprobante: ${proof}` : "",
          "",
          "Si querés, pedime el saldo, mandá otro monto, retiralo en efectivo o pasalo a Mercado Pago.",
        ]
          .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
          .join("\n");
    try {
      await sendWhatsAppMessage(to, receipt);
      await clearPendingAck(to);
    } catch (error) {
      await savePendingAck(to, receipt);
      throw error;
    }
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
    const order = await withPhoneLock(to, () =>
      createCashWithdrawal(to, amount, partner)
    );
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
        order.txHash ? `Comprobante: ${explorerTxUrl(order.txHash)}` : "",
        "",
        `Tu saldo ahora es ${remaining} USDC.`,
      ]
        .filter((line, index, lines) => line !== "" || lines[index + 1] !== "")
        .join("\n")
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
    let yielding = "0";
    try {
      yielding = (await getBlendPosition(to)).currentValueUsdc;
    } catch (error) {
      logSafeError("Saldo: no se pudo leer lo que rinde", error);
    }
    const lines = [`Tenés ${balance} USDC listos para usar.`];
    if (isPositiveUsdcAmount(yielding)) {
      lines.push(
        `Además tenés ${yielding} rindiendo. Si los querés de vuelta, escribí «sacar ${yielding} de rendir».`
      );
    }
    lines.push(
      "",
      "Si querés enviar, escribí «mandar 10». Si querés efectivo, «retirar 15 en MoneyGram». También: Mercado Pago, poner a rendir o «generame un link de cobro»."
    );
    await sendWhatsAppMessage(to, lines.join("\n"));
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

async function startMercadoPagoFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  if (amount === null) {
    setSession(to, { step: ConversationStep.AWAITING_MP_AMOUNT, name });
    await sendWhatsAppMessage(to, ASK_MP_AMOUNT);
    return;
  }

  if (amount > MAX_USDC_PER_SEND) {
    setSession(to, { step: ConversationStep.AWAITING_MP_AMOUNT, name });
    await sendWhatsAppMessage(
      to,
      `Por ahora el máximo por retiro es ${MAX_USDC_PER_SEND} dólares. Decime otro monto.`
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    `Dale, te armo el retiro de ${formatUsdcLabel(amount)} dólares a Mercado Pago...`
  );

  try {
    const started = await withPhoneLock(to, () =>
      startMercadoPagoWithdraw(to, amount)
    );
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(
      to,
      [
        "Listo. Abrí este enlace para completar el retiro en Mercado Pago:",
        started.url,
        "",
        "Cuando esté, te aviso por acá.",
      ].join("\n")
    );
  } catch (error) {
    logSafeError("Error en retiro Mercado Pago", error);
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startYieldSupplyFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  if (amount === null) {
    setSession(to, { step: ConversationStep.AWAITING_YIELD_SUPPLY_AMOUNT, name });
    await sendWhatsAppMessage(to, ASK_YIELD_SUPPLY_AMOUNT);
    return;
  }

  if (amount > MAX_USDC_PER_SEND) {
    setSession(to, { step: ConversationStep.AWAITING_YIELD_SUPPLY_AMOUNT, name });
    await sendWhatsAppMessage(
      to,
      `Por ahora el máximo es ${MAX_USDC_PER_SEND} dólares. Decime otro monto.`
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    `Perfecto, poniendo ${formatUsdcLabel(amount)} dólares a rendir...`
  );

  try {
    const result = await withPhoneLock(to, () => supplyToBlend(to, amount));
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(
      to,
      [
        `Listo 📈 Ya dejamos ${formatUsdcLabel(amount)} dólares rindiendo.`,
        `Ahí tenés aproximadamente ${result.valueUsdc} dólares.`,
        result.txHash ? `Comprobante: ${explorerTxUrl(result.txHash)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch (error) {
    logSafeError("Error al poner a rendir", error);
    setSession(to, idleSession(name));
    if (error instanceof YieldDepositsBlockedError) {
      await sendWhatsAppMessage(to, error.message);
      return;
    }
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startYieldWithdrawFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  if (amount === null) {
    setSession(to, {
      step: ConversationStep.AWAITING_YIELD_WITHDRAW_AMOUNT,
      name,
    });
    await sendWhatsAppMessage(to, ASK_YIELD_WITHDRAW_AMOUNT);
    return;
  }

  await sendWhatsAppMessage(
    to,
    `Sacando ${formatUsdcLabel(amount)} dólares de lo que está rindiendo...`
  );

  try {
    const result = await withPhoneLock(to, () => withdrawFromBlend(to, amount));
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(
      to,
      [
        `Listo. Ya volvieron ${formatUsdcLabel(amount)} dólares a tu saldo.`,
        `Te quedan aproximadamente ${result.valueUsdc} dólares rindiendo.`,
        result.txHash ? `Comprobante: ${explorerTxUrl(result.txHash)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch (error) {
    logSafeError("Error al sacar de rendir", error);
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startCobroFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  if (amount === null) {
    setSession(to, { step: ConversationStep.AWAITING_COBRO_AMOUNT, name });
    await sendWhatsAppMessage(to, ASK_COBRO_AMOUNT);
    return;
  }
  await sendCobroLink(to, name, amount);
}

async function sendCobroLink(
  to: string,
  name: string,
  amount?: number
): Promise<void> {
  const user = await getOrCreateUserAccount(to);
  const cobro = await issueCobro({
    destination: user.publicKey,
    amount,
  });
  const shareUrl = cobroPublicUrl(cobro.token);
  const png = await renderSep7QrPng(shareUrl);

  setSession(to, idleSession(name));
  await sendWhatsAppImage(to, png, cobroChatCaption(amount), "cobro-senda.png");
  await sendWhatsAppMessage(to, shareUrl);
}

function resolveCobroPayment(text: string) {
  const token = extractCobroToken(text);
  if (token) {
    const stored = peekCobro(token);
    if (!stored) {
      return null;
    }
    return parseSep7PayUri(buildSendaCobroUri(stored.destination, stored.amount));
  }
  return parseSep7PayUri(text);
}

async function paySep7Link(
  to: string,
  name: string,
  text: string,
  amountOverride?: number
): Promise<void> {
  const parsed = resolveCobroPayment(text);
  if (!parsed) {
    await sendWhatsAppMessage(
      to,
      "No pude leer ese link de cobro. Pedile a la otra persona que te lo mande de nuevo."
    );
    return;
  }

  const payer = await getOrCreateUserAccount(to);
  if (parsed.destination === payer.publicKey) {
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(
      to,
      "Ese link de cobro es tuyo. Mandáselo a la otra persona para que te pague."
    );
    return;
  }

  const amount = amountOverride ?? Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    setSession(to, {
      step: ConversationStep.AWAITING_SEP7_AMOUNT,
      name,
      pendingDestination: parsed.destination,
    });
    await sendWhatsAppMessage(
      to,
      "El link no trae monto. ¿Cuánto querés pagar? Por ejemplo 10."
    );
    return;
  }

  await sendWhatsAppMessage(
    to,
    `Pago de ${formatUsdcLabel(amount)} dólares en camino...`
  );

  try {
    const result = await withPhoneLock(to, () =>
      transferUsdcFromWallet(payer, parsed.destination, amount)
    );
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(
      to,
      [
        `Listo. Ya pagaste ${result.amountUsdc} dólares.`,
        `Tu saldo ahora es ${result.balanceUsdc} USDC.`,
        result.txHash ? `Comprobante: ${explorerTxUrl(result.txHash)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  } catch (error) {
    logSafeError("Error al pagar SEP-7", error);
    setSession(to, idleSession(name));
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function handleYieldPosition(to: string, name: string): Promise<void> {
  setSession(to, idleSession(name));
  try {
    const position = await getBlendPosition(to);
    if (!isPositiveUsdcAmount(position.currentValueUsdc)) {
      await sendWhatsAppMessage(
        to,
        "No tenés plata rindiendo ahora. Si querés poner, escribí «poner 5 a rendir»."
      );
      return;
    }
    await sendWhatsAppMessage(
      to,
      [
        `Lo que dejaste rindiendo ahora vale unos ${position.currentValueUsdc} dólares.`,
        `Es tu parte de un pozo compartido de Senda. Si querés volver a tu saldo, escribí «sacar ${position.currentValueUsdc} de rendir».`,
      ].join("\n")
    );
  } catch (error) {
    logSafeError("Error al consultar rendimiento", error);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
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
    case "withdraw_mp":
      await startMercadoPagoFlow(to, name, intent.amount);
      return;
    case "yield_supply":
      await startYieldSupplyFlow(to, name, intent.amount);
      return;
    case "yield_position":
      await handleYieldPosition(to, name);
      return;
    case "yield_withdraw":
      await startYieldWithdrawFlow(to, name, intent.amount);
      return;
    case "cobro":
      await startCobroFlow(to, name, intent.amount);
      return;
    case "sep7_pay":
      await paySep7Link(to, name, text);
      return;
    case "withdraw_status":
      await handleWithdrawStatus(to, name);
      return;
    case "option":
      if (intent.option === "2") {
        await handleBalanceQuery(to, name);
        return;
      }
      if (intent.option === "3") {
        await startWithdrawFlow(to, name, null, null);
        return;
      }
      if (intent.option === "4") {
        await startMercadoPagoFlow(to, name, null);
        return;
      }
      if (intent.option === "5") {
        await startYieldSupplyFlow(to, name, null);
        return;
      }
      if (intent.option === "6") {
        await handleYieldPosition(to, name);
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
  text: string,
  messageId?: string
): Promise<void> {
  currentMessageId = messageId;
  try {
    await handleIncomingWhatsAppMessageInner(from, name, text);
  } finally {
    currentMessageId = undefined;
  }
}

function isReceiptQuery(text: string): boolean {
  return /\b(llego|llegó|comprobante|me llego|ya llego|me lo mandaste)\b/.test(
    normalizeText(text)
  );
}

async function handleIncomingWhatsAppMessageInner(
  from: string,
  name: string,
  text: string
): Promise<void> {
  const setupInvite = await maybeInviteWalletSetup(from, name);
  if (setupInvite) {
    await sendWelcomeVideoOrCaption(from, welcomeVideoCaption(name));
    await sleep(2800);
    await sendWhatsAppMessage(from, setupInvite);
    return;
  }

  if (isReceiptQuery(text)) {
    const ack = getPendingAck(from);
    if (ack) {
      await sendWhatsAppMessage(from, ack.text);
      return;
    }
  }

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
    intent.type === "option" &&
    session.step === ConversationStep.AWAITING_MENU_OPTION
  ) {
    await dispatchIntent(from, session.name, text);
    return;
  }

  if (
    intent.type === "balance" ||
    intent.type === "menu" ||
    intent.type === "withdraw" ||
    intent.type === "withdraw_status" ||
    intent.type === "withdraw_mp" ||
    intent.type === "yield_supply" ||
    intent.type === "yield_position" ||
    intent.type === "yield_withdraw" ||
    intent.type === "cobro" ||
    intent.type === "sep7_pay" ||
    (intent.type === "send" && intent.amount !== null && hasSendVerb(text))
  ) {
    await dispatchIntent(from, session.name, text);
    return;
  }

  if (session.step === ConversationStep.AWAITING_USD_AMOUNT) {
    await handleUsdAmount(from, session.name, text);
    return;
  }

  if (session.step === ConversationStep.AWAITING_WITHDRAW_AMOUNT) {
    const amount = extractUsdAmount(text);
    const partner = extractPartner(text) ?? session.pendingPartner ?? null;

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
    const amount = session.pendingAmount ?? extractUsdAmount(text);
    const partner = extractPartner(text);

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

  if (session.step === ConversationStep.AWAITING_MP_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        `No vi un monto en lo que escribiste. ${ASK_MP_AMOUNT}`
      );
      return;
    }
    await startMercadoPagoFlow(from, session.name, amount);
    return;
  }

  if (session.step === ConversationStep.AWAITING_YIELD_SUPPLY_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        `No vi un monto en lo que escribiste. ${ASK_YIELD_SUPPLY_AMOUNT}`
      );
      return;
    }
    await startYieldSupplyFlow(from, session.name, amount);
    return;
  }

  if (session.step === ConversationStep.AWAITING_COBRO_AMOUNT) {
    if (/^(cualquiera|sin monto|da igual|no importa)$/i.test(normalizeText(text))) {
      await sendCobroLink(from, session.name);
      return;
    }
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        `No vi un monto en lo que escribiste. ${ASK_COBRO_AMOUNT}`
      );
      return;
    }
    await sendCobroLink(from, session.name, amount);
    return;
  }

  if (session.step === ConversationStep.AWAITING_SEP7_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null || !session.pendingDestination) {
      await sendWhatsAppMessage(
        from,
        "No vi un monto. Decime cuánto querés pagar, por ejemplo 10."
      );
      return;
    }
    await paySep7Link(
      from,
      session.name,
      `web+stellar:pay?destination=${session.pendingDestination}&amount=${amount}`,
      amount
    );
    return;
  }

  if (session.step === ConversationStep.AWAITING_YIELD_WITHDRAW_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        `No vi un monto en lo que escribiste. ${ASK_YIELD_WITHDRAW_AMOUNT}`
      );
      return;
    }
    await startYieldWithdrawFlow(from, session.name, amount);
    return;
  }

  await dispatchIntent(from, session.name, text);
}
