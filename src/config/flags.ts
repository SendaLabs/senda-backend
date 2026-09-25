export function hasPrivyCredentials(): boolean {
  return Boolean(
    process.env.PRIVY_APP_ID?.trim() && process.env.PRIVY_APP_SECRET?.trim()
  );
}

export function isUsableWebSetupUrl(raw?: string): boolean {
  const value = (raw ?? process.env.WEB_SETUP_PUBLIC_URL ?? "").trim();
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (local) {
      return process.env.NODE_ENV !== "production";
    }
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Privy self-custodial solo si el alta web y el session signer existen de verdad. */
export function isPrivySelfCustodyReady(): boolean {
  return Boolean(
    hasPrivyCredentials() &&
      process.env.PRIVY_SESSION_SIGNER_ID?.trim() &&
      process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY?.trim() &&
      process.env.PRIVY_SPEND_POLICY_ID?.trim() &&
      isUsableWebSetupUrl()
  );
}

export function usePrivyWallets(): boolean {
  const raw = process.env.USE_PRIVY_WALLETS?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  return isPrivySelfCustodyReady();
}

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:../data/senda.db";
}
