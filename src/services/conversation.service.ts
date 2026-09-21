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
  formatCentsAsUsd,
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
  "Ingresá el monto que querés acreditar en Stellar Testnet.\nEjemplo: 10";

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
      `Vamos a acreditar XLM en tu cuenta de Testnet, ligada a este WhatsApp.\n\n${ASK_USD_AMOUNT}`
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
    "Registrando el movimiento en Stellar Testnet..."
  );

  try {
    const result = await creditUserOnTestnet(to, usdAmount);
    setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });

    const lines = [
      "Movimiento confirmado en Stellar Testnet.",
      "",
      `Monto enviado: ${result.amountXlm} XLM`,
      `Tu cuenta: ${result.publicKey}`,
      `Saldo actual: ${result.nativeBalanceXlm} XLM`,
      `Pago: ${explorerTxUrl(result.paymentHash)}`,
    ];

    if (result.contractTxHash) {
      lines.push(`Contrato: ${explorerTxUrl(result.contractTxHash)}`);
    }

    if (result.contractBalanceCents) {
      lines.push(
        `Saldo en contrato Senda: ${formatCentsAsUsd(result.contractBalanceCents)}`
      );
    }

    if (result.contractError) {
      lines.push(`El pago on-chain salió, el contrato no: ${result.contractError}`);
    }

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
          "Elegí la opción 1 para crear la cuenta en Testnet y acreditar XLM.",
          "",
          WELCOME_MENU_TEXT,
        ].join("\n")
      );
      return;
    }

    const lines = [
      "Estado on-chain de tu cuenta (Stellar Testnet).",
      "",
      `Red: ${state.network}`,
      `Cuenta: ${state.publicKey}`,
      `Saldo: ${state.nativeBalanceXlm} XLM`,
      `Explorador: ${explorerAccountUrl(state.publicKey)}`,
    ];

    if (state.latestLedger) {
      lines.push(`Ledger: ${state.latestLedger}`);
    }

    if (state.contractBalanceCents) {
      lines.push(
        `Saldo en contrato Senda: ${formatCentsAsUsd(state.contractBalanceCents)}`
      );
    } else if (state.contractId) {
      lines.push("El contrato está configurado, pero no hay saldo acreditado aún.");
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
