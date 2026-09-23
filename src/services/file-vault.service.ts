import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getFileVaultSecret } from "./custody-secrets.service";

const PREFIX = "enc:v1:";

function vaultKey(): Buffer {
  return createHash("sha256").update(getFileVaultSecret(), "utf8").digest();
}

export function isVaultCiphertext(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptString(value: string): string {
  if (!isVaultCiphertext(value)) {
    throw new Error("El valor no está cifrado con el vault");
  }

  const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("El ciphertext del vault está incompleto");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    vaultKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function redactSecrets(text: string): string {
  return text
    .replace(/\bS[A-Z2-7]{55}\b/g, "[redacted-seed]")
    .replace(
      /(["']?secretKey["']?\s*[:=]\s*["']?)[^"'\s,}\\]+/gi,
      "$1[redacted-seed]"
    );
}
