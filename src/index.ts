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
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          audio?: {
            id?: string;
            mime_type?: string;
            voice?: boolean;
          };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
        }>;
      };
    }>;
  }>;
}

type IncomingWhatsAppMessage =
  | {
      kind: "text";
      from: string;
      name: string;
      text: string;
      messageId?: string;
    }
  | {
      kind: "audio";
      from: string;
      name: string;
      mediaId: string;
      mimeType?: string;
      messageId?: string;
    }
  | { kind: "unsupported"; from: string; name: string; messageId?: string };

const processedMessageIds = new Map<string, number>();
const MESSAGE_TTL_MS = 10 * 60 * 1000;

function rememberMessage(id?: string): boolean {
  if (!id) {
    return false;
  }

  const now = Date.now();
  for (const [knownId, seenAt] of processedMessageIds) {
    if (now - seenAt > MESSAGE_TTL_MS) {
      processedMessageIds.delete(knownId);
    }
  }

  if (processedMessageIds.has(id)) {
    return true;
  }

  processedMessageIds.set(id, now);
  return false;
}

function extractIncomingWhatsAppMessages(
  payload: WhatsAppWebhookPayload
): IncomingWhatsAppMessage[] {
  const incoming: IncomingWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const statuses = value?.statuses ?? [];
      const messages = value?.messages ?? [];

      if (statuses.length && !messages.length) {
        console.log(
          `Webhook: status ignorado ${statuses
            .map((status) => `${status.status ?? "?"}→${status.recipient_id ?? "?"}`)
            .join(", ")}`
        );
        continue;
      }

      for (const message of messages) {
        const from = (
          value?.contacts?.[0]?.wa_id ||
          message.from ||
          ""
        ).replace(/\D/g, "");
        const name = value?.contacts?.[0]?.profile?.name?.trim() || "amigo";

        if (!from) {
          continue;
        }

        if (rememberMessage(message.id)) {
          console.log(`Webhook: mensaje duplicado ${message.id} ignorado`);
          continue;
        }

        console.log(
          `Webhook: mensaje ${message.id ?? "sin-id"} de ${from} tipo=${message.type ?? "?"}`
        );

        if (message.type === "audio" || message.audio?.id) {
          const mediaId = message.audio?.id;
          incoming.push(
            mediaId
              ? {
                  kind: "audio",
                  from,
                  name,
                  mediaId,
                  mimeType: message.audio?.mime_type,
                  messageId: message.id,
                }
              : { kind: "unsupported", from, name, messageId: message.id }
          );
          continue;
        }

        if (message.type === "text" || message.text?.body) {
          incoming.push({
            kind: "text",
            from,
            name,
            text: message.text?.body?.trim() ?? "",
            messageId: message.id,
          });
          continue;
        }

        incoming.push({
          kind: "unsupported",
          from,
          name,
          messageId: message.id,
        });
      }
    }
  }

  return incoming;
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

async function handleOneIncoming(incoming: IncomingWhatsAppMessage): Promise<void> {
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

async function processIncomingWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  console.log("Webhook POST recibido:", JSON.stringify(payload));

  const incoming = extractIncomingWhatsAppMessages(payload);
  for (const message of incoming) {
    await handleOneIncoming(message);
  }
}

app.post("/webhook", (req: Request, res: Response) => {
  res.sendStatus(200);
  void processIncomingWebhook(req.body);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
