import axios, { isAxiosError } from "axios";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";

export const WELCOME_VIDEO_URL =
  "https://files.catbox.moe/75h8v0.mp4";

export const WELCOME_VIDEO_CAPTION =
  "¡Hola! 👋 Bienvenido a Senda. Te ayudo a enviar y recibir USDC al toque, sin vueltas.";

export const WELCOME_MENU_TEXT =
  "¿En qué te ayudo?\n\nEscribime como hables, no hace falta elegir 1 o 2. Por ejemplo:\n• «cuánto tengo» o «ver mis USDC»\n• «quiero mandar 20 dólares a mi mamá»\n• «retirar 15 en MoneyGram» o «sacar efectivo»";

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
  to: string;
  type: "text" | "video";
  text?: { body: string };
  video?: { link: string; caption?: string };
};

export class WhatsAppSendError extends Error {
  readonly status?: number;
  readonly code?: number;
  readonly to: string;
  readonly kind: "text" | "video";

  constructor(params: {
    to: string;
    kind: "text" | "video";
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
      `${scope}: WhatsApp ${error.kind} a ${error.to} status=${error.status ?? "?"} code=${error.code ?? "?"} ${error.message}`
    );
    return;
  }

  if (isAxiosError(error)) {
    const summary = summarizeMetaError(error);
    console.error(
      `${scope}: HTTP ${summary.status ?? "?"} code=${summary.code ?? "?"} ${summary.message}`
    );
    return;
  }

  if (error instanceof Error) {
    console.error(`${scope}: ${error.name}: ${error.message}`);
    return;
  }

  console.error(`${scope}: error desconocido`);
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

async function postWhatsAppMessage(
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
    console.log(
      `WhatsApp: ${payload.type} enviado a ${payload.to}${messageId ? ` (id: ${messageId})` : ""}`
    );

    return data;
  } catch (error) {
    const summary = summarizeMetaError(error);
    const wrapped = new WhatsAppSendError({
      to: payload.to,
      kind: payload.type,
      status: summary.status,
      code: summary.code,
      message: summary.message,
    });
    logSafeError("WhatsApp", wrapped);
    throw wrapped;
  }
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

export async function sendWhatsAppVideo(
  to: string,
  link: string,
  caption?: string
): Promise<WhatsAppMessageResponse> {
  return postWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "video",
    video: caption ? { link, caption } : { link },
  });
}
