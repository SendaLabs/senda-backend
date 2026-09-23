import axios from "axios";
import FormData from "form-data";
import {
  downloadWhatsAppMedia,
  isSupportedVoiceMime,
  MAX_VOICE_BYTES,
  sanitizeVoiceFilename,
} from "./whatsapp.media.service";
import { logSafeError } from "./whatsapp.service";

const OPENAI_TRANSCRIPTIONS_URL =
  "https://api.openai.com/v1/audio/transcriptions";

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Falta OPENAI_API_KEY para transcribir notas de voz");
  }
  return key;
}

function getTranscriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  if (buffer.length > MAX_VOICE_BYTES) {
    throw new Error("El audio supera el tamaño máximo permitido");
  }
  if (!isSupportedVoiceMime(mimeType)) {
    throw new Error("El audio no tiene un formato soportado");
  }

  const safeName = sanitizeVoiceFilename(filename);

  try {
    const form = new FormData();
    form.append("file", buffer, {
      filename: safeName,
      contentType: mimeType,
    });
    form.append("model", getTranscriptionModel());
    form.append("language", "es");
    form.append("response_format", "json");

    const { data } = await axios.post<{ text?: string }>(
      OPENAI_TRANSCRIPTIONS_URL,
      form,
      {
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
          ...form.getHeaders(),
        },
        maxBodyLength: MAX_VOICE_BYTES,
        maxContentLength: MAX_VOICE_BYTES,
      }
    );

    return data.text?.trim() ?? "";
  } catch (error) {
    logSafeError("Whisper", error);
    throw new Error("No se pudo transcribir la nota de voz");
  }
}

export async function transcribeWhatsAppAudio(
  mediaId: string,
  mimeType?: string
): Promise<string> {
  if (!isSupportedVoiceMime(mimeType)) {
    throw new Error("El audio no tiene un formato soportado");
  }

  const media = await downloadWhatsAppMedia(mediaId);
  const filename = sanitizeVoiceFilename(`nota-voz${media.extension}`);
  return transcribeAudioBuffer(media.buffer, filename, media.mimeType);
}
