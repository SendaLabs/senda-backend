import axios, { isAxiosError } from "axios";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";

export const WELCOME_VIDEO_URL =
  "https://files.catbox.moe/75h8v0.mp4";

export const WELCOME_VIDEO_CAPTION =
  "¡Hola! 👋 Bienvenido a Senda. Senda puede ayudarte a enviar, recibir y gestionar fácilmente.";

export const WELCOME_MENU_TEXT =
  "¿Qué te gustaría hacer hoy?\n\nPodés escribirlo como te salga, por ejemplo:\n• «saldo» o «cuánto tengo»\n• «mandar 10» o «retirar 5»\n\nTambién sirve:\n1️⃣ Recibir / Retirar USDC\n2️⃣ Consultar saldo USDC";

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
    if (isAxiosError(error)) {
      console.error(JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error(`WhatsApp: error inesperado al enviar ${payload.type}`, error);
    }

    throw error;
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
