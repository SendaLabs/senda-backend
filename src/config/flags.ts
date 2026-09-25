export function hasPrivyCredentials(): boolean {
  return Boolean(
    process.env.PRIVY_APP_ID?.trim() && process.env.PRIVY_APP_SECRET?.trim()
  );
}

export function usePrivyWallets(): boolean {
  const raw = process.env.USE_PRIVY_WALLETS?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  return hasPrivyCredentials();
}

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:../data/senda.db";
}
