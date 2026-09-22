import { randomUUID } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import axios from "axios";
import {
  downloadWhatsAppMedia,
  isSupportedVoiceMime,
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
  const tempPath = join(tmpdir(), `senda-voice-${randomUUID()}-${filename}`);

  try {
    await writeFile(tempPath, buffer);

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/ogg" }),
      filename
    );
    form.append("model", getTranscriptionModel());
    form.append("language", "es");
    form.append("response_format", "json");

    const { data } = await axios.post<{ text?: string }>(
      OPENAI_TRANSCRIPTIONS_URL,
      form,
      {
        headers: {
          Authorization: `Bearer ${getOpenAiApiKey()}`,
        },
        maxBodyLength: 25 * 1024 * 1024,
      }
    );

    return data.text?.trim() ?? "";
  } catch (error) {
    logSafeError("Whisper", error);
    throw new Error("No se pudo transcribir la nota de voz");
  } finally {
    await unlink(tempPath).catch(() => undefined);
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
  const filename = `nota-voz${media.extension}`;
  return transcribeAudioBuffer(media.buffer, filename, media.mimeType);
}
