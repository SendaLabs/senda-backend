import axios from "axios";
import { getWhatsAppAccessToken, logSafeError } from "./whatsapp.service";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";

export interface DownloadedWhatsAppMedia {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

interface MediaMetadata {
  url?: string;
  mime_type?: string;
}

function extensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return ".mp3";
  }
  if (normalized.includes("mp4") || normalized.includes("m4a") || normalized.includes("aac")) {
    return ".m4a";
  }
  if (normalized.includes("wav")) {
    return ".wav";
  }
  if (normalized.includes("amr")) {
    return ".amr";
  }
  if (normalized.includes("webm")) {
    return ".webm";
  }
  return ".ogg";
}

export function isSupportedVoiceMime(mimeType?: string): boolean {
  if (!mimeType) {
    return true;
  }
  const normalized = mimeType.toLowerCase();
  return (
    normalized.includes("audio/") ||
    normalized.includes("ogg") ||
    normalized.includes("opus") ||
    normalized.includes("mpeg") ||
    normalized.includes("mp3") ||
    normalized.includes("mp4") ||
    normalized.includes("aac") ||
    normalized.includes("amr") ||
    normalized.includes("wav")
  );
}

export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<DownloadedWhatsAppMedia> {
  const token = getWhatsAppAccessToken();
  const metadataUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;

  try {
    const { data } = await axios.get<MediaMetadata>(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!data.url) {
      throw new Error("Meta no devolvió la URL del audio");
    }

    const mimeType = data.mime_type ?? "audio/ogg";
    const { data: binary } = await axios.get<ArrayBuffer>(data.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });

    return {
      buffer: Buffer.from(binary),
      mimeType,
      extension: extensionFromMime(mimeType),
    };
  } catch (error) {
    logSafeError("WhatsApp media", error);
    throw new Error("No se pudo descargar la nota de voz");
  }
}
