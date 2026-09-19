import axios, { isAxiosError } from "axios";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";

export interface WhatsAppTextMessageResponse {
  messaging_product: "whatsapp";
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
  }>;
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

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<WhatsAppTextMessageResponse> {
  const { token, phoneNumberId } = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const { data } = await axios.post<WhatsAppTextMessageResponse>(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const messageId = data.messages?.[0]?.id;
    console.log(
      `WhatsApp: mensaje enviado a ${to}${messageId ? ` (id: ${messageId})` : ""}`
    );

    return data;
  } catch (error) {
    if (isAxiosError(error)) {
      console.error(
        "WhatsApp: error al enviar mensaje",
        error.response?.data ?? error.message
      );
    } else {
      console.error("WhatsApp: error inesperado al enviar mensaje", error);
    }

    throw error;
  }
}
