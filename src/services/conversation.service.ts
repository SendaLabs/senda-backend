import {
  ConversationStep,
  getSession,
  isMenuRequest,
  parseMenuOption,
  setSession,
} from "./session.service";
import { parseUsdAmount } from "./remittance.service";
import {
  creditUserOnTestnet,
  explorerAccountUrl,
  explorerTxUrl,
  getUserOnChainState,
} from "./stellar.service";
import {
  sendWhatsAppMessage,
  sendWhatsAppVideo,
  WELCOME_MENU_TEXT,
  WELCOME_VIDEO_CAPTION,
  WELCOME_VIDEO_URL,
} from "./whatsapp.service";

const ASK_USD_AMOUNT =
  "Ingresá el monto en USDC que querés recibir.\nEjemplo: 10";

async function sendMenu(to: string, name: string): Promise<void> {
  await sendWhatsAppMessage(to, WELCOME_MENU_TEXT);
  setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });
}

export async function sendWelcomeFlow(to: string, name: string): Promise<void> {
  try {
    await sendWhatsAppVideo(to, WELCOME_VIDEO_URL, WELCOME_VIDEO_CAPTION);
  } catch (error) {
    console.error("Webhook: no se pudo enviar el video de bienvenida", error);
  }

  await sendMenu(to, name);
}

async function handleMenuOption(
  to: string,
  name: string,
  option: "1" | "2"
): Promise<void> {
  if (option === "1") {
    setSession(to, { step: ConversationStep.AWAITING_USD_AMOUNT, name });
    await sendWhatsAppMessage(
      to,
      `Vamos a enviarte USDC en Stellar Testnet a la cuenta ligada a este WhatsApp.\n\n${ASK_USD_AMOUNT}`
    );
    return;
  }

  await handleBalanceQuery(to, name);
}

async function handleUsdAmount(
  to: string,
  name: string,
  text: string
): Promise<void> {
  const usdAmount = parseUsdAmount(text);
  if (usdAmount === null) {
    await sendWhatsAppMessage(to, `No pude leer ese monto. ${ASK_USD_AMOUNT}`);
    return;
  }

  await sendWhatsAppMessage(
    to,
    "Enviando USDC por el Stellar Asset Contract..."
  );

  try {
    const result = await creditUserOnTestnet(to, usdAmount);
    setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });

    const lines = [
      "Transferencia USDC confirmada en Stellar Testnet.",
      "",
      `Monto enviado: ${result.amountUsdc} USDC`,
      `Tu cuenta: ${result.publicKey}`,
      `Saldo USDC: ${result.usdcBalance} USDC`,
      `Reserva XLM: ${result.nativeBalanceXlm} XLM`,
      `Transacción: ${explorerTxUrl(result.usdcTxHash)}`,
    ];

    lines.push("", WELCOME_MENU_TEXT);
    await sendWhatsAppMessage(to, lines.join("\n"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "La red rechazó la transacción";
    console.error("Error al acreditar en Testnet:", error);
    await sendWhatsAppMessage(
      to,
      `No se pudo completar el movimiento en Stellar Testnet.\n${message}`
    );
  }
}

async function handleBalanceQuery(to: string, name: string): Promise<void> {
  setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });

  try {
    const state = await getUserOnChainState(to);
    if (!state) {
      await sendWhatsAppMessage(
        to,
        [
          "Este WhatsApp todavía no tiene una cuenta Stellar asociada.",
          "Elegí la opción 1 para crear la cuenta en Testnet y recibir USDC.",
          "",
          WELCOME_MENU_TEXT,
        ].join("\n")
      );
      return;
    }

    const lines = [
      "Saldo on-chain (Stellar Testnet).",
      "",
      `Red: ${state.network}`,
      `Cuenta: ${state.publicKey}`,
      `USDC: ${state.usdcBalance ?? "no disponible"}`,
      `XLM (fees): ${state.nativeBalanceXlm}`,
      `Explorador: ${explorerAccountUrl(state.publicKey)}`,
    ];

    if (state.latestLedger) {
      lines.push(`Ledger: ${state.latestLedger}`);
    }

    if (state.usdcSacId) {
      lines.push(`SAC USDC: ${state.usdcSacId}`);
    }

    lines.push("", WELCOME_MENU_TEXT);
    await sendWhatsAppMessage(to, lines.join("\n"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo consultar Horizon/RPC";
    console.error("Error al consultar Testnet:", error);
    await sendWhatsAppMessage(
      to,
      `No se pudo leer la cuenta en Stellar Testnet.\n${message}`
    );
  }
}

export async function handleIncomingWhatsAppMessage(
  from: string,
  name: string,
  text: string
): Promise<void> {
  const session = getSession(from);

  if (!session) {
    await sendWelcomeFlow(from, name);
    return;
  }

  if (
    isMenuRequest(text) &&
    session.step !== ConversationStep.AWAITING_MENU_OPTION
  ) {
    await sendMenu(from, session.name);
    return;
  }

  switch (session.step) {
    case ConversationStep.AWAITING_MENU_OPTION: {
      const option = parseMenuOption(text);
      if (!option) {
        await sendWhatsAppMessage(from, WELCOME_MENU_TEXT);
        return;
      }
      await handleMenuOption(from, session.name, option);
      return;
    }
    case ConversationStep.AWAITING_USD_AMOUNT:
      await handleUsdAmount(from, session.name, text);
      return;
  }
}
