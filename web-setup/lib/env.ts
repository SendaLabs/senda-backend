export function getSendaApiUrl(): string {
  return (process.env.NEXT_PUBLIC_SENDA_API_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

export function getWhatsAppReturnUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_WHATSAPP_CLICK_TO_CHAT || "").replace(
    /\D/g,
    ""
  );
  return raw ? `https://wa.me/${raw}` : "https://wa.me/";
}

export function getSessionSignerId(): string {
  return process.env.NEXT_PUBLIC_PRIVY_SESSION_SIGNER_ID?.trim() || "";
}

export function getSpendPolicyId(): string {
  return process.env.NEXT_PUBLIC_PRIVY_SPEND_POLICY_ID?.trim() || "";
}
