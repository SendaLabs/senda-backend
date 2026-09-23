const userIdByPhone = new Map<string, string>();

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function rememberWhatsAppRecipient(
  phone: string,
  userId?: string
): void {
  const normalized = digits(phone);
  if (!normalized || !userId) {
    return;
  }
  userIdByPhone.set(normalized, userId);
}

export function getWhatsAppUserId(phone: string): string | undefined {
  return userIdByPhone.get(digits(phone));
}

export function isWhatsAppUserId(value: string): boolean {
  return /^[A-Z]{2}\./.test(value);
}
