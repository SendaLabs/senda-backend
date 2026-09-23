import { createHmac, createHash, timingSafeEqual } from "crypto";

export const META_SIGNATURE_HEADER = "x-hub-signature-256";

export function getWhatsAppAppSecret(): string {
  return process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
}

export function getWebhookVerifyToken(): string {
  return process.env.VERIFY_TOKEN?.trim() ?? "";
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function hashWhatsAppSender(from: string): string {
  return createHash("sha256").update(from).digest("hex").slice(0, 12);
}

export function expectedMetaSignature(
  rawBody: Buffer,
  appSecret: string
): string {
  const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret = getWhatsAppAppSecret()
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }

  return safeEqual(
    signatureHeader.trim(),
    expectedMetaSignature(rawBody, appSecret)
  );
}

export function resolveWebhookChallenge(query: {
  mode?: unknown;
  token?: unknown;
  challenge?: unknown;
}): string | null {
  const verifyToken = getWebhookVerifyToken();
  if (!verifyToken) {
    return null;
  }

  const mode = typeof query.mode === "string" ? query.mode : "";
  const token = typeof query.token === "string" ? query.token : "";
  const challenge = typeof query.challenge === "string" ? query.challenge : "";

  if (mode !== "subscribe" || !token || !challenge) {
    return null;
  }

  if (!safeEqual(token, verifyToken)) {
    return null;
  }

  return challenge;
}
