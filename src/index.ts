import path from "path";
import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { handleIncomingWhatsAppMessage } from "./services/conversation.service";
import { replyUserError } from "./services/ledger-error.service";
import { claimProcessedMessage } from "./services/processed-messages.store";
import { transcribeWhatsAppAudio } from "./services/transcription.service";
import { rememberWhatsAppRecipient } from "./services/whatsapp.recipients";
import {
  hashWhatsAppSender,
  META_SIGNATURE_HEADER,
  resolveWebhookChallenge,
  verifyMetaSignature,
} from "./services/webhook-security.service";
import { assertRuntimeSecrets } from "./services/custody-secrets.service";
import { reconcileOfframpOrders } from "./services/offramp.service";
import { resumePendingSep24Withdrawals } from "./services/sep24-withdraw.service";
import { startHorizonListener } from "./stellar/horizon-listener";
import { ensureTreasuryUsdcTrustline } from "./stellar/treasury";
import { assertNetworkConsistency } from "./services/stellar.service";
import {
  logSafeError,
  sendWhatsAppMessage,
  WhatsAppSendError,
} from "./services/whatsapp.service";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

type SignedRequest = Request & { rawBody?: Buffer };

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as SignedRequest).rawBody = buf;
    },
  })
);

const WELCOME_VIDEO_FILE = path.join(process.cwd(), "src", "public", "0920.mp4");

app.get("/media/welcome.mp4", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.sendFile(WELCOME_VIDEO_FILE, (error) => {
    if (error && !res.headersSent) {
      res.sendStatus(404);
    }
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "senda-backend",
    network: process.env.STELLAR_NETWORK ?? "testnet",
  });
});

app.get("/ready", (_req: Request, res: Response) => {
  const checks = {
    whatsappToken: Boolean(process.env.WHATSAPP_TOKEN?.trim()),
    whatsappPhone: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()),
    appSecret: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
    stellarSecret: Boolean(process.env.STELLAR_SECRET_KEY?.trim()),
    custodyMaster: Boolean(process.env.CUSTODY_MASTER_SECRET?.trim()),
    fileVault: Boolean(process.env.FILE_VAULT_SECRET?.trim()),
    offrampVault: Boolean(process.env.STELLAR_OFFRAMP_PUBLIC_KEY?.trim()),
    network: process.env.STELLAR_NETWORK ?? "testnet",
    welcomeVideo:
      process.env.WELCOME_SKIP_VIDEO?.trim() === "true" ? "skipped" : "enabled",
  };
  const ok =
    checks.whatsappToken &&
    checks.whatsappPhone &&
    checks.appSecret &&
    checks.stellarSecret &&
    checks.custodyMaster &&
    checks.fileVault &&
    checks.offrampVault;
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "missing_env", checks });
});

app.get("/webhook", (req: Request, res: Response) => {
  const challenge = resolveWebhookChallenge({
    mode: req.query["hub.mode"],
    token: req.query["hub.verify_token"],
    challenge: req.query["hub.challenge"],
  });

  if (challenge === null) {
    res.sendStatus(403);
    return;
  }

  res.status(200).send(challenge);
});

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
          user_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          from_user_id?: string;
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
      messageId: string;
    }
  | {
      kind: "audio";
      from: string;
      name: string;
      mediaId: string;
      mimeType?: string;
      messageId: string;
    }
  | { kind: "unsupported"; from: string; name: string; messageId: string };

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
        console.log(`Webhook: ${statuses.length} status ignorado(s)`);
        continue;
      }

      for (const message of messages) {
        const from = (
          value?.contacts?.[0]?.wa_id ||
          message.from ||
          ""
        ).replace(/\D/g, "");
        const userId =
          value?.contacts?.[0]?.user_id || message.from_user_id;
        const name = value?.contacts?.[0]?.profile?.name?.trim() || "amigo";

        if (!from) {
          continue;
        }

        const messageId = message.id;
        if (!messageId) {
          console.log("Webhook: mensaje sin id ignorado");
          continue;
        }

        const claim = claimProcessedMessage(messageId);
        if (claim === "duplicate") {
          console.log(`Webhook: mensaje duplicado ${messageId} ignorado`);
          continue;
        }

        rememberWhatsAppRecipient(from, userId);
        console.log(
          `Webhook: mensaje ${messageId} from=${hashWhatsAppSender(from)} tipo=${message.type ?? "?"}`
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
                  messageId,
                }
              : { kind: "unsupported", from, name, messageId }
          );
          continue;
        }

        if (message.type === "text" || message.text?.body) {
          incoming.push({
            kind: "text",
            from,
            name,
            text: message.text?.body?.trim() ?? "",
            messageId,
          });
          continue;
        }

        incoming.push({
          kind: "unsupported",
          from,
          name,
          messageId,
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

  console.log(
    `Webhook: voz transcrita ${incoming.messageId} chars=${transcript.length}`
  );
  return transcript;
}

async function handleOneIncoming(incoming: IncomingWhatsAppMessage): Promise<void> {
  try {
    const text = await resolveIncomingText(incoming);
    if (text === null) {
      return;
    }

    await handleIncomingWhatsAppMessage(
      incoming.from,
      incoming.name,
      text,
      incoming.messageId
    );
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
          : replyUserError(error)
      );
    } catch (replyError) {
      logSafeError("Webhook: tampoco se pudo avisar al usuario", replyError);
    }
  }
}

async function processIncomingWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  const incoming = extractIncomingWhatsAppMessages(payload);
  console.log(`Webhook: ${incoming.length} mensaje(s) a procesar`);
  for (const message of incoming) {
    await handleOneIncoming(message);
  }
}

app.post("/webhook", (req: Request, res: Response) => {
  const signed = req as SignedRequest;
  if (!verifyMetaSignature(signed.rawBody, req.header(META_SIGNATURE_HEADER))) {
    console.error("Webhook: firma Meta ausente o inválida");
    res.sendStatus(403);
    return;
  }

  res.sendStatus(200);
  void processIncomingWebhook(req.body);
});

try {
  assertRuntimeSecrets();
  assertNetworkConsistency();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Config inválida");
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
  void reconcileOfframpOrders().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "No se pudieron reconciliar retiros"
    );
  });
  void resumePendingSep24Withdrawals();
  void ensureTreasuryUsdcTrustline()
    .then(() => startHorizonListener())
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : "No se pudo arrancar el listener de tesorería"
      );
    });
});
