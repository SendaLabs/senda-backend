import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { handleIncomingWhatsAppMessage } from "./services/conversation.service";
import { humanizeLedgerError } from "./services/ledger-error.service";
import { transcribeWhatsAppAudio } from "./services/transcription.service";
import {
  logSafeError,
  sendWhatsAppMessage,
  WhatsAppSendError,
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
          audio?: {
            id?: string;
            mime_type?: string;
            voice?: boolean;
          };
        }>;
      };
    }>;
  }>;
}

type IncomingWhatsAppMessage =
  | { kind: "text"; from: string; name: string; text: string }
  | {
      kind: "audio";
      from: string;
      name: string;
      mediaId: string;
      mimeType?: string;
    }
  | { kind: "unsupported"; from: string; name: string };

function extractIncomingWhatsAppMessage(
  payload: WhatsAppWebhookPayload
): IncomingWhatsAppMessage | null {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  const from = message?.from;
  const name = value?.contacts?.[0]?.profile?.name?.trim() || "amigo";

  if (!from || !message) {
    return null;
  }

  if (message.type === "audio" || message.audio?.id) {
    const mediaId = message.audio?.id;
    if (!mediaId) {
      return { kind: "unsupported", from, name };
    }
    return {
      kind: "audio",
      from,
      name,
      mediaId,
      mimeType: message.audio?.mime_type,
    };
  }

  if (message.type === "text" || message.text?.body) {
    return {
      kind: "text",
      from,
      name,
      text: message.text?.body?.trim() ?? "",
    };
  }

  return { kind: "unsupported", from, name };
}

async function resolveIncomingText(
  incoming: IncomingWhatsAppMessage
): Promise<string | null> {
  if (incoming.kind === "text") {
    return incoming.text;
  }

  if (incoming.kind === "unsupported") {
    await sendWhatsAppMessage(
      incoming.from,
      "Por ahora te leo texto o una nota de voz. Mandame eso y te ayudo."
    );
    return null;
  }

  const transcript = await transcribeWhatsAppAudio(
    incoming.mediaId,
    incoming.mimeType
  );

  if (!transcript) {
    await sendWhatsAppMessage(
      incoming.from,
      "No pude entender esa nota. ¿La repetís o me lo escribís?"
    );
    return null;
  }

  console.log(`Voz transcrita de ${incoming.from}: ${transcript}`);
  return transcript;
}

async function processIncomingWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  console.log("Webhook POST recibido:", JSON.stringify(payload));

  const incoming = extractIncomingWhatsAppMessage(payload);
  if (!incoming) {
    return;
  }

  try {
    const text = await resolveIncomingText(incoming);
    if (text === null) {
      return;
    }

    await handleIncomingWhatsAppMessage(incoming.from, incoming.name, text);
  } catch (error) {
    logSafeError("Webhook: no se pudo responder al usuario", error);
    if (error instanceof WhatsAppSendError) {
      return;
    }

    try {
      await sendWhatsAppMessage(
        incoming.from,
        incoming.kind === "audio"
          ? "No pude escuchar esa nota ahora. ¿Me lo escribís?"
          : humanizeLedgerError(error)
      );
    } catch (replyError) {
      logSafeError("Webhook: tampoco se pudo avisar al usuario", replyError);
    }
  }
}

app.post("/webhook", (req: Request, res: Response) => {
  res.sendStatus(200);
  void processIncomingWebhook(req.body);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
