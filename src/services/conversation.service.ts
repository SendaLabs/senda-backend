import {
  ConversationStep,
  getSession,
  setSession,
} from "./session.service";
import { classifyIntent } from "./intent.service";
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
  "Decime el monto en USDC. Por ejemplo: 10, o «mandar 10».";

function guideUser(name: string): string {
  return [
    `${name}, no te seguí del todo.`,
    "",
    "Puedo consultar tu saldo o enviarte USDC en Testnet.",
    "Probá con algo como «saldo», «cuánto tengo» o «mandar 10».",
  ].join("\n");
}

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

async function startSendFlow(to: string, name: string): Promise<void> {
  setSession(to, { step: ConversationStep.AWAITING_USD_AMOUNT, name });
  await sendWhatsAppMessage(
    to,
    `Dale, armamos el envío de USDC a la cuenta ligada a este WhatsApp.\n\n${ASK_USD_AMOUNT}`
  );
}

async function executeUsdcTransfer(
  to: string,
  name: string,
  usdAmount: number
): Promise<void> {
  await sendWhatsAppMessage(
    to,
    "Enviando USDC por el Stellar Asset Contract..."
  );

  try {
    const result = await creditUserOnTestnet(to, usdAmount);
    setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });

    await sendWhatsAppMessage(
      to,
      [
        "Listo, la transferencia USDC se confirmó en Stellar Testnet.",
        "",
        `Monto enviado: ${result.amountUsdc} USDC`,
        `Tu cuenta: ${result.publicKey}`,
        `Saldo USDC: ${result.usdcBalance} USDC`,
        `Reserva XLM: ${result.nativeBalanceXlm} XLM`,
        `Transacción: ${explorerTxUrl(result.usdcTxHash)}`,
        "",
        "Si querés, pedime el saldo o mandá otro monto.",
      ].join("\n")
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "La red rechazó la transacción";
    console.error("Error al acreditar en Testnet:", error);
    await sendWhatsAppMessage(
      to,
      `No pude completar el envío en Stellar Testnet.\n${message}\n\nPodés reintentar con «mandar 10» o consultar con «saldo».`
    );
  }
}

async function handleUsdAmount(
  to: string,
  name: string,
  text: string
): Promise<void> {
  const usdAmount = parseUsdAmount(text);
  if (usdAmount === null) {
    await sendWhatsAppMessage(
      to,
      `No encontré un monto en lo que escribiste. ${ASK_USD_AMOUNT}`
    );
    return;
  }

  await executeUsdcTransfer(to, name, usdAmount);
}

async function handleBalanceQuery(to: string, name: string): Promise<void> {
  setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });

  try {
    const state = await getUserOnChainState(to);
    if (!state) {
      await sendWhatsAppMessage(
        to,
        [
          "Todavía no hay una cuenta Stellar asociada a este WhatsApp.",
          "Escribí «mandar 10» (o el monto que quieras) para crearla y recibir USDC.",
        ].join("\n")
      );
      return;
    }

    const lines = [
      "Este es tu saldo on-chain en Stellar Testnet.",
      "",
      `USDC: ${state.usdcBalance ?? "no disponible"}`,
      `XLM (fees): ${state.nativeBalanceXlm}`,
      `Cuenta: ${state.publicKey}`,
      `Explorador: ${explorerAccountUrl(state.publicKey)}`,
    ];

    if (state.latestLedger) {
      lines.push(`Ledger: ${state.latestLedger}`);
    }

    lines.push("", "Podés seguir con «mandar 10» o pedir el saldo de nuevo.");
    await sendWhatsAppMessage(to, lines.join("\n"));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo consultar Horizon/RPC";
    console.error("Error al consultar Testnet:", error);
    await sendWhatsAppMessage(
      to,
      `No pude leer la cuenta en Stellar Testnet.\n${message}`
    );
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
    case "option":
      if (intent.option === "2") {
        await handleBalanceQuery(to, name);
        return;
      }
      await startSendFlow(to, name);
      return;
    case "menu":
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

    setSession(from, {
      step: ConversationStep.AWAITING_MENU_OPTION,
      name,
    });
    await dispatchIntent(from, name, text);
    return;
  }

  if (session.step === ConversationStep.AWAITING_USD_AMOUNT) {
    if (intent.type === "balance" || intent.type === "menu") {
      await dispatchIntent(from, session.name, text);
      return;
    }

    if (intent.type === "send" && intent.amount !== null) {
      await executeUsdcTransfer(from, session.name, intent.amount);
      return;
    }

    await handleUsdAmount(from, session.name, text);
    return;
  }

  await dispatchIntent(from, session.name, text);
}
