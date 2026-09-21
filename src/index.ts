import express, { Request, Response } from "express";
import dotenv from "dotenv";
import {
  ConversationStep,
  getSession,
  parseMenuOption,
  setSession,
} from "./services/session.service";
import {
  sendWhatsAppMessage,
  sendWhatsAppVideo,
  WELCOME_MENU_TEXT,
  WELCOME_VIDEO_CAPTION,
  WELCOME_VIDEO_URL,
} from "./services/whatsapp.service";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "senda-backend",
    network: process.env.STELLAR_NETWORK ?? "testnet",
  });
});

app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

function extractIncomingWhatsAppMessage(payload: WhatsAppWebhookPayload): {
  from: string;
  name: string;
  text: string;
} | null {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const from = message?.from;
  const name = value?.contacts?.[0]?.profile?.name;

  if (!from) {
    return null;
  }

  return {
    from,
    name: name?.trim() || "amigo",
    text: message?.text?.body?.trim() ?? "",
  };
}

async function sendWelcomeFlow(to: string, name: string): Promise<void> {
  try {
    await sendWhatsAppVideo(to, WELCOME_VIDEO_URL, WELCOME_VIDEO_CAPTION);
  } catch (error) {
    console.error("Webhook: no se pudo enviar el video de bienvenida", error);
  }

  await sendWhatsAppMessage(to, WELCOME_MENU_TEXT);
  setSession(to, { step: ConversationStep.AWAITING_MENU_OPTION, name });
}

async function handleMenuOption(
  to: string,
  name: string,
  option: "1" | "2"
): Promise<void> {
  if (option === "1") {
    setSession(to, { step: ConversationStep.RECEIVE_OR_WITHDRAW, name });
    await sendWhatsAppMessage(
      to,
      "Perfecto. Vamos a ayudarte a recibir o retirar un pago del exterior."
    );
    return;
  }

  setSession(to, { step: ConversationStep.CHECK_TRANSFER, name });
  await sendWhatsAppMessage(
    to,
    "Perfecto. Vamos a consultar el estado de tu transferencia."
  );
}

app.post("/webhook", async (req: Request, res: Response) => {
  console.log("Webhook POST recibido:", JSON.stringify(req.body));

  const incoming = extractIncomingWhatsAppMessage(req.body);
  if (!incoming) {
    res.sendStatus(200);
    return;
  }

  try {
    const session = getSession(incoming.from);

    if (!session) {
      await sendWelcomeFlow(incoming.from, incoming.name);
      res.sendStatus(200);
      return;
    }

    if (session.step === ConversationStep.AWAITING_MENU_OPTION) {
      const option = parseMenuOption(incoming.text);

      if (!option) {
        await sendWhatsAppMessage(incoming.from, WELCOME_MENU_TEXT);
        res.sendStatus(200);
        return;
      }

      await handleMenuOption(incoming.from, session.name, option);
    }
  } catch (error) {
    console.error("Webhook: no se pudo responder al usuario", error);
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
