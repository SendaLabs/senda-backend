export function usePrivyWallets(): boolean {
  return process.env.USE_PRIVY_WALLETS === "true";
}

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:../data/senda.db";
}
