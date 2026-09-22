import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { handleIncomingWhatsAppMessage } from "./services/conversation.service";
import { humanizeLedgerError } from "./services/ledger-error.service";
import { sendWhatsAppMessage } from "./services/whatsapp.service";

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

app.post("/webhook", async (req: Request, res: Response) => {
  console.log("Webhook POST recibido:", JSON.stringify(req.body));

  const incoming = extractIncomingWhatsAppMessage(req.body);
  if (!incoming) {
    res.sendStatus(200);
    return;
  }

  try {
    await handleIncomingWhatsAppMessage(
      incoming.from,
      incoming.name,
      incoming.text
    );
  } catch (error) {
    console.error("Webhook: no se pudo responder al usuario", error);
    try {
      await sendWhatsAppMessage(
        incoming.from,
        humanizeLedgerError(error)
      );
    } catch (replyError) {
      console.error("Webhook: tampoco se pudo avisar al usuario", replyError);
    }
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
