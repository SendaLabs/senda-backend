import axios from "axios";
import { getWhatsAppAccessToken, logSafeError } from "./whatsapp.service";

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v22.0";
export const MAX_VOICE_BYTES = 16 * 1024 * 1024;

const ALLOWED_VOICE_MIMES = [
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
];

const META_MEDIA_HOST_RE =
  /(^|\.)((facebook|whatsapp)\.com|fbcdn\.net|fbsbx\.com|whatsapp\.net)$/i;

export interface DownloadedWhatsAppMedia {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

interface MediaMetadata {
  url?: string;
  mime_type?: string;
}

export function extensionFromMime(mimeType: string): string {
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

export function sanitizeVoiceFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "nota-voz.ogg";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!cleaned || cleaned.includes("..")) {
    return "nota-voz.ogg";
  }
  return cleaned.slice(0, 64);
}

export function isSupportedVoiceMime(mimeType?: string): boolean {
  if (!mimeType) {
    return false;
  }
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!normalized.startsWith("audio/")) {
    return false;
  }
  return ALLOWED_VOICE_MIMES.includes(normalized);
}

export function isMetaMediaHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") {
      return false;
    }
    return META_MEDIA_HOST_RE.test(hostname);
  } catch {
    return false;
  }
}

function assertMetaMediaUrl(url: string): void {
  if (!isMetaMediaHost(url)) {
    throw new Error("La URL del audio no pertenece a Meta");
  }
}

export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<DownloadedWhatsAppMedia> {
  const token = getWhatsAppAccessToken();
  const metadataUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;

  try {
    const { data } = await axios.get<MediaMetadata>(metadataUrl, {
      headers: { Authorization: `Bearer ${token}` },
      maxContentLength: MAX_VOICE_BYTES,
      maxBodyLength: MAX_VOICE_BYTES,
    });

    if (!data.url) {
      throw new Error("Meta no devolvió la URL del audio");
    }
    if (!data.mime_type || !isSupportedVoiceMime(data.mime_type)) {
      throw new Error("El audio no tiene un formato soportado");
    }

    assertMetaMediaUrl(data.url);

    const { data: binary } = await axios.get<ArrayBuffer>(data.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      maxContentLength: MAX_VOICE_BYTES,
      maxBodyLength: MAX_VOICE_BYTES,
      maxRedirects: 3,
      beforeRedirect: (options) => {
        const next = options.href ?? `https://${options.hostname}${options.path ?? ""}`;
        assertMetaMediaUrl(next);
      },
    });

    return {
      buffer: Buffer.from(binary),
      mimeType: data.mime_type,
      extension: extensionFromMime(data.mime_type),
    };
  } catch (error) {
    logSafeError("WhatsApp media", error);
    throw new Error("No se pudo descargar la nota de voz");
  }
}
