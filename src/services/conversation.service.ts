import {
  askAmount,
  askCobroAmount,
  askMpAmount,
  askYieldSupplyAmount,
  askYieldWithdrawAmount,
  balanceHintText,
  balanceReadyText,
  balanceYieldingText,
  cobroBadLinkText,
  cobroNeedAmountText,
  cobroOwnLinkText,
  cobroPaidText,
  cobroPayNeedAmountText,
  cobroPayingText,
  isAnyAmount,
  missingAmountText,
  mpProcessingText,
  mpReadyText,
  sendDuplicateText,
  sendMaxText,
  sendProcessingText,
  sendReceiptText,
  startSendText,
  withdrawMaxText,
  yieldMaxText,
  yieldNoneText,
  yieldPositionText,
  yieldSupplyProcessingText,
  yieldSupplyReadyText,
  yieldWithdrawProcessingText,
  yieldWithdrawReadyText,
} from "../i18n/copy";
import { inferLocale, isGreeting, type Locale } from "../i18n/locale";
import { maybeInviteWalletSetup, type SetupInvite } from "../wallet/wallet-setup";
import {
  ConversationStep,
  getSession,
  hydrateSession,
  isMenuRequest,
  setSession,
  type ConversationSession,
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
import { cobroChatCaption, cobroWhatsAppShareUrl } from "../qr/cobro-copy";
import { extractCobroToken, issueCobro, peekCobro } from "../qr/cobro.store";
import {
  buildSendaCobroUri,
  parseSep7PayUri,
  renderSep7QrPng,
} from "../qr/sep7";
import { startMercadoPagoWithdraw } from "./sep24-withdraw.service";
import {
  deposit as supplyToBlend,
  getPosition as getBlendPosition,
  withdraw as withdrawFromBlend,
  BlendOperationError,
  YieldDepositsBlockedError,
} from "../yield/savings-service";
import { isPositiveUsdcAmount } from "../yield/yield-book";
import {
  logSafeError,
  sendWhatsAppCtaUrl,
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendWhatsAppVideo,
  welcomeMenuText,
  welcomeVideoCaption,
  getWelcomeVideoUrl,
} from "./whatsapp.service";

const MAX_USDC_PER_SEND = 500;

function localeOf(phone: string, fallback: Locale = "es"): Locale {
  return getSession(phone)?.locale ?? fallback;
}

async function rememberLocale(phone: string, text: string, name: string): Promise<Locale> {
  const detected = inferLocale(text);
  const locale = detected ?? localeOf(phone);
  const current = getSession(phone);
  if (current) {
    if (current.locale !== locale || current.name !== name) {
      await setSession(phone, { ...current, name, locale });
    }
  }
  return locale;
}

function formatUsdcLabel(amount: number): string {
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(2).replace(/\.?0+$/, "");
}

function guideUser(name: string, locale: Locale = "es"): string {
  return welcomeMenuText(name, locale);
}

function idleSession(
  name: string,
  extras?: {
    pendingAmount?: number;
    locale?: Locale;
    pendingDestination?: string;
  }
): ConversationSession {
  return {
    step: ConversationStep.AWAITING_MENU_OPTION,
    name,
    ...extras,
  };
}

async function saveSession(
  to: string,
  name: string,
  patch: Partial<ConversationSession> = {}
): Promise<ConversationSession> {
  return setSession(to, {
    step: ConversationStep.AWAITING_MENU_OPTION,
    name,
    locale: localeOf(to),
    ...patch,
  });
}

async function sendMenu(
  to: string,
  name: string,
  locale: Locale = "es"
): Promise<void> {
  await sendWhatsAppMessage(to, welcomeMenuText(name, locale));
  await setSession(to, idleSession(name, { locale }));
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

export async function sendSetupInviteSafe(
  to: string,
  invite: SetupInvite
): Promise<void> {
  try {
    await sendWhatsAppCtaUrl(to, invite.text, invite.button, invite.url);
  } catch (error) {
    logSafeError("Alta: no pude mandar el botón de WhatsApp", error);
    await sendWhatsAppMessage(to, `${invite.text}\n\n${invite.url}`);
  }
}

async function sendWelcomeFlow(
  to: string,
  name: string,
  locale: Locale = "es"
): Promise<void> {
  const caption = welcomeVideoCaption(name, locale);
  await sendWelcomeVideoOrCaption(to, caption);
  // WhatsApp entrega el texto antes que el video si van pegados.
  await sleep(2800);
  await sendMenu(to, name, locale);
}

async function startSendFlow(to: string, name: string): Promise<void> {
  const locale = localeOf(to);
  await saveSession(to, name, { step: ConversationStep.AWAITING_USD_AMOUNT });
  await sendWhatsAppMessage(to, startSendText(locale));
}

async function executeUsdcTransfer(
  to: string,
  name: string,
  usdAmount: number,
  messageId?: string
): Promise<void> {
  const locale = localeOf(to);
  if (usdAmount > MAX_USDC_PER_SEND) {
    await saveSession(to, name, { step: ConversationStep.AWAITING_USD_AMOUNT });
    await sendWhatsAppMessage(to, sendMaxText(locale, MAX_USDC_PER_SEND));
    return;
  }

  await sendWhatsAppMessage(
    to,
    sendProcessingText(locale, formatUsdcLabel(usdAmount))
  );

  try {
    const result = await withPhoneLock(to, async () => {
      if (messageId) {
        const claim = await beginCreditClaim(messageId, to, usdAmount);
        if (claim.status === "duplicate") {
          return {
            amountUsdc: String(usdAmount),
            usdcBalance: (await getUserOnChainState(to)).usdcBalance ?? "0",
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
    await saveSession(to, name);

    const proof =
      result.txHash && !result.duplicate ? explorerTxUrl(result.txHash) : "";
    const receipt = result.duplicate
      ? sendDuplicateText(locale)
      : sendReceiptText(locale, result.amountUsdc, result.usdcBalance, proof);
    try {
      await sendWhatsAppMessage(to, receipt);
      await clearPendingAck(to);
    } catch (error) {
      await savePendingAck(to, receipt);
      throw error;
    }
  } catch (error) {
    logSafeError("Error al acreditar", error);
    await saveSession(to, name, { step: ConversationStep.AWAITING_USD_AMOUNT });
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function handleUsdAmount(
  to: string,
  name: string,
  text: string,
  messageId?: string
): Promise<void> {
  const usdAmount = extractUsdAmount(text);
  if (usdAmount === null) {
    await sendWhatsAppMessage(
      to,
      missingAmountText(localeOf(to), askAmount(localeOf(to)))
    );
    return;
  }

  await executeUsdcTransfer(to, name, usdAmount, messageId);
}

async function handleBalanceQuery(to: string, name: string): Promise<void> {
  const locale = localeOf(to);
  await saveSession(to, name);

  try {
    const state = await getUserOnChainState(to);
    const balance = state.usdcBalance ?? "0";
    let yielding = "0";
    try {
      yielding = (await getBlendPosition(to)).currentValueUsdc;
    } catch (error) {
      logSafeError("Saldo: no se pudo leer lo que rinde", error);
    }
    const lines = [balanceReadyText(locale, balance)];
    if (isPositiveUsdcAmount(yielding)) {
      lines.push(balanceYieldingText(locale, yielding));
    }
    lines.push("", balanceHintText(locale));
    await sendWhatsAppMessage(to, lines.join("\n"));
  } catch (error) {
    logSafeError("Error al consultar saldo", error);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startMercadoPagoFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  const locale = localeOf(to);
  if (amount === null) {
    await saveSession(to, name, { step: ConversationStep.AWAITING_MP_AMOUNT });
    await sendWhatsAppMessage(to, askMpAmount(locale));
    return;
  }

  if (amount > MAX_USDC_PER_SEND) {
    await saveSession(to, name, { step: ConversationStep.AWAITING_MP_AMOUNT });
    await sendWhatsAppMessage(to, withdrawMaxText(locale, MAX_USDC_PER_SEND));
    return;
  }

  await sendWhatsAppMessage(
    to,
    mpProcessingText(locale, formatUsdcLabel(amount))
  );

  try {
    const started = await withPhoneLock(to, () =>
      startMercadoPagoWithdraw(to, amount)
    );
    await saveSession(to, name);
    await sendWhatsAppMessage(to, mpReadyText(locale, started.url));
  } catch (error) {
    logSafeError("Error en retiro Mercado Pago", error);
    await saveSession(to, name);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startYieldSupplyFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  const locale = localeOf(to);
  if (amount === null) {
    await saveSession(to, name, {
      step: ConversationStep.AWAITING_YIELD_SUPPLY_AMOUNT,
    });
    await sendWhatsAppMessage(to, askYieldSupplyAmount(locale));
    return;
  }

  if (amount > MAX_USDC_PER_SEND) {
    await saveSession(to, name, {
      step: ConversationStep.AWAITING_YIELD_SUPPLY_AMOUNT,
    });
    await sendWhatsAppMessage(to, yieldMaxText(locale, MAX_USDC_PER_SEND));
    return;
  }

  await sendWhatsAppMessage(
    to,
    yieldSupplyProcessingText(locale, formatUsdcLabel(amount))
  );

  try {
    const result = await withPhoneLock(to, () => supplyToBlend(to, amount));
    await saveSession(to, name);
    await sendWhatsAppMessage(
      to,
      yieldSupplyReadyText(
        locale,
        formatUsdcLabel(amount),
        result.valueUsdc,
        result.txHash ? explorerTxUrl(result.txHash) : ""
      )
    );
  } catch (error) {
    logSafeError("Error al poner a rendir", error);
    await saveSession(to, name);
    if (error instanceof YieldDepositsBlockedError) {
      await sendWhatsAppMessage(to, error.message);
      return;
    }
    if (error instanceof BlendOperationError) {
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
  const locale = localeOf(to);
  if (amount === null) {
    await saveSession(to, name, {
      step: ConversationStep.AWAITING_YIELD_WITHDRAW_AMOUNT,
    });
    await sendWhatsAppMessage(to, askYieldWithdrawAmount(locale));
    return;
  }

  await sendWhatsAppMessage(
    to,
    yieldWithdrawProcessingText(locale, formatUsdcLabel(amount))
  );

  try {
    const result = await withPhoneLock(to, () => withdrawFromBlend(to, amount));
    await saveSession(to, name);
    await sendWhatsAppMessage(
      to,
      yieldWithdrawReadyText(
        locale,
        formatUsdcLabel(amount),
        result.valueUsdc,
        result.txHash ? explorerTxUrl(result.txHash) : ""
      )
    );
  } catch (error) {
    logSafeError("Error al sacar de rendir", error);
    await saveSession(to, name);
    if (error instanceof BlendOperationError) {
      await sendWhatsAppMessage(to, error.message);
      return;
    }
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function startCobroFlow(
  to: string,
  name: string,
  amount: number | null
): Promise<void> {
  if (amount === null) {
    await saveSession(to, name, { step: ConversationStep.AWAITING_COBRO_AMOUNT });
    await sendWhatsAppMessage(to, askCobroAmount(localeOf(to)));
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
  const shareUrl = cobroWhatsAppShareUrl(cobro.token);
  const png = await renderSep7QrPng(shareUrl);

  await saveSession(to, name);
  await sendWhatsAppImage(
    to,
    png,
    cobroChatCaption(amount, localeOf(to)),
    "cobro-senda.png"
  );
  await sendWhatsAppMessage(to, shareUrl);
}

async function resolveCobroPayment(text: string) {
  const token = extractCobroToken(text);
  if (token) {
    const stored = await peekCobro(token);
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
  const locale = localeOf(to);
  const parsed = await resolveCobroPayment(text);
  if (!parsed) {
    await sendWhatsAppMessage(to, cobroBadLinkText(locale));
    return;
  }

  const payer = await getOrCreateUserAccount(to);
  if (parsed.destination === payer.publicKey) {
    await saveSession(to, name);
    await sendWhatsAppMessage(to, cobroOwnLinkText(locale));
    return;
  }

  const amount = amountOverride ?? Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    await saveSession(to, name, {
      step: ConversationStep.AWAITING_SEP7_AMOUNT,
      pendingDestination: parsed.destination,
    });
    await sendWhatsAppMessage(to, cobroNeedAmountText(locale));
    return;
  }

  await sendWhatsAppMessage(
    to,
    cobroPayingText(locale, formatUsdcLabel(amount))
  );

  try {
    const result = await withPhoneLock(to, () =>
      transferUsdcFromWallet(payer, parsed.destination, amount)
    );
    await saveSession(to, name);
    await sendWhatsAppMessage(
      to,
      cobroPaidText(
        locale,
        result.amountUsdc,
        result.balanceUsdc,
        result.txHash ? explorerTxUrl(result.txHash) : ""
      )
    );
  } catch (error) {
    logSafeError("Error al pagar SEP-7", error);
    await saveSession(to, name);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function handleYieldPosition(to: string, name: string): Promise<void> {
  const locale = localeOf(to);
  await saveSession(to, name);
  try {
    const position = await getBlendPosition(to);
    if (!isPositiveUsdcAmount(position.currentValueUsdc)) {
      await sendWhatsAppMessage(to, yieldNoneText(locale));
      return;
    }
    await sendWhatsAppMessage(
      to,
      yieldPositionText(locale, position.currentValueUsdc)
    );
  } catch (error) {
    logSafeError("Error al consultar rendimiento", error);
    await sendWhatsAppMessage(to, humanizeLedgerError(error));
  }
}

async function dispatchIntent(
  to: string,
  name: string,
  text: string,
  messageId?: string
): Promise<void> {
  const intent = classifyIntent(text);

  switch (intent.type) {
    case "balance":
      await handleBalanceQuery(to, name);
      return;
    case "send":
      if (intent.amount !== null) {
        await executeUsdcTransfer(to, name, intent.amount, messageId);
        return;
      }
      await startSendFlow(to, name);
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
    case "option":
      if (intent.option === "2") {
        await handleBalanceQuery(to, name);
        return;
      }
      if (intent.option === "3") {
        await startMercadoPagoFlow(to, name, null);
        return;
      }
      if (intent.option === "4") {
        await startYieldSupplyFlow(to, name, null);
        return;
      }
      if (intent.option === "5") {
        await handleYieldPosition(to, name);
        return;
      }
      if (intent.option === "6") {
        await startCobroFlow(to, name, null);
        return;
      }
      await startSendFlow(to, name);
      return;
    case "menu":
      if (isGreeting(text)) {
        await sendWelcomeFlow(to, name, localeOf(to));
        return;
      }
      await sendMenu(to, name, localeOf(to));
      return;
    case "unknown":
      await sendWhatsAppMessage(to, guideUser(name, localeOf(to)));
      return;
  }
}

export async function handleIncomingWhatsAppMessage(
  from: string,
  name: string,
  text: string,
  messageId?: string
): Promise<void> {
  await handleIncomingWhatsAppMessageInner(from, name, text, messageId);
}

function isReceiptQuery(text: string): boolean {
  return /\b(llego|llegó|comprobante|me llego|ya llego|me lo mandaste)\b/.test(
    normalizeText(text)
  );
}

async function handleIncomingWhatsAppMessageInner(
  from: string,
  name: string,
  text: string,
  messageId?: string
): Promise<void> {
  await hydrateSession(from);
  const locale = await rememberLocale(from, text, name);
  const setupInvite = await maybeInviteWalletSetup(from, name, locale);
  if (setupInvite) {
    const firstTouch = !getSession(from);
    await saveSession(from, name, { locale });
    if (firstTouch || isGreeting(text) || isMenuRequest(text)) {
      await sendWelcomeVideoOrCaption(from, welcomeVideoCaption(name, locale));
      await sleep(2800);
    }
    await sendSetupInviteSafe(from, setupInvite);
    return;
  }

  if (isReceiptQuery(text)) {
    const ack = await getPendingAck(from);
    if (ack) {
      await sendWhatsAppMessage(from, ack.text);
      return;
    }
  }

  const session = getSession(from);
  const intent = classifyIntent(text);

  if (!session) {
    await saveSession(from, name, { locale });
    if (intent.type === "unknown" || intent.type === "menu") {
      await sendWelcomeFlow(from, name, locale);
      return;
    }

    await dispatchIntent(from, name, text, messageId);
    return;
  }

  if (
    intent.type === "option" &&
    session.step === ConversationStep.AWAITING_MENU_OPTION
  ) {
    await dispatchIntent(from, session.name, text, messageId);
    return;
  }

  if (
    intent.type === "balance" ||
    intent.type === "menu" ||
    intent.type === "withdraw_mp" ||
    intent.type === "yield_supply" ||
    intent.type === "yield_position" ||
    intent.type === "yield_withdraw" ||
    intent.type === "cobro" ||
    intent.type === "sep7_pay" ||
    (intent.type === "send" && intent.amount !== null && hasSendVerb(text))
  ) {
    await dispatchIntent(from, session.name, text, messageId);
    return;
  }

  if (session.step === ConversationStep.AWAITING_USD_AMOUNT) {
    await handleUsdAmount(from, session.name, text, messageId);
    return;
  }

  if (
    session.step === ConversationStep.AWAITING_WITHDRAW_AMOUNT ||
    session.step === ConversationStep.AWAITING_WITHDRAW_PARTNER
  ) {
    await sendMenu(from, session.name, locale);
    return;
  }

  if (session.step === ConversationStep.AWAITING_MP_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        missingAmountText(locale, askMpAmount(locale))
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
        missingAmountText(locale, askYieldSupplyAmount(locale))
      );
      return;
    }
    await startYieldSupplyFlow(from, session.name, amount);
    return;
  }

  if (session.step === ConversationStep.AWAITING_COBRO_AMOUNT) {
    if (isAnyAmount(normalizeText(text))) {
      await sendCobroLink(from, session.name);
      return;
    }
    const amount = extractUsdAmount(text);
    if (amount === null) {
      await sendWhatsAppMessage(
        from,
        missingAmountText(locale, askCobroAmount(locale))
      );
      return;
    }
    await sendCobroLink(from, session.name, amount);
    return;
  }

  if (session.step === ConversationStep.AWAITING_SEP7_AMOUNT) {
    const amount = extractUsdAmount(text);
    if (amount === null || !session.pendingDestination) {
      await sendWhatsAppMessage(from, cobroPayNeedAmountText(locale));
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
        missingAmountText(locale, askYieldWithdrawAmount(locale))
      );
      return;
    }
    await startYieldWithdrawFlow(from, session.name, amount);
    return;
  }

  await dispatchIntent(from, session.name, text, messageId);
}
