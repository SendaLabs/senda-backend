import { readFile } from "fs/promises";
import path from "path";
import axios, { isAxiosError } from "axios";
import { redactSecrets } from "./file-vault.service";
import { hashWhatsAppSender } from "./webhook-security.service";
import { getWhatsAppUserId } from "./whatsapp.recipients";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";

const FALLBACK_WELCOME_VIDEO_URL = "https://files.catbox.moe/75h8v0.mp4";

export function getWelcomeVideoUrl(): string {
  const configured = process.env.WELCOME_VIDEO_URL?.trim();
  if (configured) {
    return configured;
  }

  const base = (
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    ""
  ).replace(/\/$/, "");

  if (base) {
    return `${base}/media/welcome.mp4`;
  }

  return FALLBACK_WELCOME_VIDEO_URL;
}

export const WELCOME_VIDEO_URL = FALLBACK_WELCOME_VIDEO_URL;

export const WELCOME_VIDEO_CAPTION =
  "¡Hola! 👋 Bienvenido a Senda. Te ayudo a enviar y recibir USDC al toque, sin vueltas.";

export const WELCOME_MENU_TEXT = [
  "¿En qué te ayudo? Escribí el número o la frase:",
  "",
  "1. Enviar USDC",
  "2. Ver saldo",
  "3. Retirar en efectivo",
  "4. Pasar a Mercado Pago",
  "5. Poner a rendir",
  "6. Cuánto tengo rindiendo",
  "",
  "También sirve una nota de voz. Ejemplos: «mandar 5», «retirar 2 en MoneyGram», «poner 1 a rendir».",
].join("\n");

export interface WhatsAppMessageResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
  }>;
}

type WhatsAppOutgoingPayload = {
  messaging_product: "whatsapp";
  recipient_type?: "individual";
  to?: string;
  recipient?: string;
  type: "text" | "video" | "image";
  text?: { body: string };
  video?: { link?: string; id?: string; caption?: string };
  image?: { link?: string; id?: string; caption?: string };
};

export class WhatsAppSendError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly to: string;
  readonly kind: "text" | "video" | "image";

  constructor(params: {
    to: string;
    kind: "text" | "video" | "image";
    status?: number;
    code?: number;
    message: string;
  }) {
    super(params.message);
    this.name = "WhatsAppSendError";
    this.to = params.to;
    this.kind = params.kind;
    this.status = params.status;
    this.code = params.code;
  }
}

function summarizeMetaError(error: unknown): {
  status?: number;
  code?: number;
  message: string;
} {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { code?: number; error_subcode?: number; message?: string } }
      | undefined;
    const meta = data?.error;
    return {
      status: error.response?.status,
      code: meta?.code,
      message: meta?.message ?? error.message,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Error desconocido al hablar con WhatsApp" };
}

export function logSafeError(scope: string, error: unknown): void {
  if (error instanceof WhatsAppSendError) {
    console.error(
      redactSecrets(
        `${scope}: WhatsApp ${error.kind} a ${hashWhatsAppSender(error.to)} status=${error.status ?? "?"} code=${error.code ?? "?"} ${error.message}`
      )
    );
    return;
  }

  if (isAxiosError(error)) {
    const summary = summarizeMetaError(error);
    console.error(
      redactSecrets(
        `${scope}: HTTP ${summary.status ?? "?"} code=${summary.code ?? "?"} ${summary.message}`
      )
    );
    return;
  }

  if (error instanceof Error) {
    console.error(redactSecrets(`${scope}: ${error.name}: ${error.message}`));
    return;
  }

  console.error(`${scope}: error desconocido`);
}

export function getWhatsAppAccessToken(): string {
  return getWhatsAppConfig().token;
}

function recipientCandidates(to: string): string[] {
  const digits = to.replace(/\D/g, "");
  const candidates = [to, digits];

  if (digits.startsWith("549") && digits.length >= 12) {
    candidates.push(`54${digits.slice(3)}`);
  } else if (digits.startsWith("54") && digits.length >= 11) {
    candidates.push(`549${digits.slice(2)}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isRetryableSendCode(code?: number): boolean {
  return code === 131030 || code === 131026 || code === 133010 || code === 100;
}

function getWhatsAppConfig(): { token: string; phoneNumberId: string } {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) {
    throw new Error("Falta la variable de entorno WHATSAPP_TOKEN");
  }

  if (!phoneNumberId) {
    throw new Error("Falta la variable de entorno WHATSAPP_PHONE_NUMBER_ID");
  }

  return { token, phoneNumberId };
}

async function postWhatsAppMessageOnce(
  payload: WhatsAppOutgoingPayload
): Promise<WhatsAppMessageResponse> {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const { data } = await axios.post<WhatsAppMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const messageId = data.messages?.[0]?.id;
    const destination = payload.recipient ?? payload.to ?? "?";
    console.log(
      `WhatsApp: ${payload.type} enviado a ${destination}${messageId ? ` (id: ${messageId})` : ""}`
    );

    return data;
  } catch (error) {
    const summary = summarizeMetaError(error);
    const wrapped = new WhatsAppSendError({
      to: payload.recipient ?? payload.to ?? "desconocido",
      kind: payload.type,
      status: summary.status,
      code: summary.code,
      message: summary.message,
    });
    logSafeError("WhatsApp", wrapped);
    throw wrapped;
  }
}

async function postWhatsAppMessage(
  payload: WhatsAppOutgoingPayload
): Promise<WhatsAppMessageResponse> {
  const phone = payload.to ?? "";
  const userId = payload.recipient ?? (phone ? getWhatsAppUserId(phone) : undefined);
  let lastError: WhatsAppSendError | undefined;

  if (userId) {
    try {
      const { to: _ignored, ...rest } = payload;
      return await postWhatsAppMessageOnce({
        ...rest,
        recipient_type: "individual",
        recipient: userId,
      });
    } catch (error) {
      if (!(error instanceof WhatsAppSendError) || !isRetryableSendCode(error.code)) {
        throw error;
      }
      lastError = error;
    }
  }

  const candidates = phone ? recipientCandidates(phone) : [];
  for (const to of candidates) {
    try {
      const { recipient: _ignored, ...rest } = payload;
      return await postWhatsAppMessageOnce({
        ...rest,
        recipient_type: "individual",
        to,
      });
    } catch (error) {
      if (error instanceof WhatsAppSendError && isRetryableSendCode(error.code)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new WhatsAppSendError({
    to: userId ?? phone,
    kind: payload.type,
    message: "No se pudo enviar el mensaje de WhatsApp",
  });
}

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<WhatsAppMessageResponse> {
  return postWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

const WELCOME_VIDEO_FILE = path.join(
  process.cwd(),
  "src",
  "public",
  "0920.mp4"
);

let cachedWelcomeMediaId: string | undefined;

async function uploadWelcomeVideo(): Promise<string> {
  if (cachedWelcomeMediaId) {
    return cachedWelcomeMediaId;
  }

  const { token, phoneNumberId } = getWhatsAppConfig();
  const buffer = await readFile(WELCOME_VIDEO_FILE);
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "video");
  form.append(
    "file",
    new Blob([buffer], { type: "video/mp4" }),
    "welcome.mp4"
  );

  const { data } = await axios.post<{ id?: string }>(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      maxBodyLength: 16 * 1024 * 1024,
    }
  );

  if (!data.id) {
    throw new Error("Meta no devolvió id de media para el video");
  }

  cachedWelcomeMediaId = data.id;
  console.log(`WhatsApp: video de bienvenida subido media=${data.id}`);
  return data.id;
}

export async function sendWhatsAppVideo(
  to: string,
  link: string,
  caption?: string
): Promise<WhatsAppMessageResponse> {
  if (/^(1|true|yes)$/i.test(process.env.WELCOME_SKIP_VIDEO?.trim() || "")) {
    throw new Error("Video de bienvenida desactivado");
  }

  try {
    const mediaId = await uploadWelcomeVideo();
    return await postWhatsAppMessage({
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: caption ? { id: mediaId, caption } : { id: mediaId },
    });
  } catch (error) {
    logSafeError("WhatsApp: upload de video, fallback a link", error);
    cachedWelcomeMediaId = undefined;
  }

  return postWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "video",
    video: caption ? { link, caption } : { link },
  });
}

export async function sendWhatsAppImage(
  to: string,
  image: Buffer,
  caption?: string,
  filename = "cobro.png"
): Promise<WhatsAppMessageResponse> {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "image");
  form.append("file", new Blob([image], { type: "image/png" }), filename);

  const { data } = await axios.post<{ id?: string }>(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
    form,
    {
      headers: { Authorization: `Bearer ${token}` },
      maxBodyLength: 8 * 1024 * 1024,
    }
  );
  if (!data.id) {
    throw new Error("Meta no devolvió id de media para la imagen");
  }

  return postWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: caption ? { id: data.id, caption } : { id: data.id },
  });
}
