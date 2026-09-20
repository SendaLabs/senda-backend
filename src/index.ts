import express, { Request, Response } from "express";
import dotenv from "dotenv";
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
        }>;
      };
    }>;
  }>;
}

function extractIncomingWhatsAppMessage(payload: WhatsAppWebhookPayload): {
  from: string;
  name: string;
} | null {
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const from = value?.messages?.[0]?.from;
  const name = value?.contacts?.[0]?.profile?.name;

  if (!from) {
    return null;
  }

  return {
    from,
    name: name?.trim() || "amigo",
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
    await sendWhatsAppMessage(
      incoming.from,
      `Hola ${incoming.name}, bienvenido a Senda`
    );
  } catch (error) {
    console.error("Webhook: no se pudo responder al usuario", error);
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Senda backend escuchando en http://localhost:${port}`);
});
