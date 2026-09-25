import { PrivyClient } from "@privy-io/node";

export interface PrivyStellarWallet {
  walletId: string;
  address: string;
}

function getPrivyCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("Faltan PRIVY_APP_ID o PRIVY_APP_SECRET");
  }
  return { appId, appSecret };
}

export function getPrivyClient(): PrivyClient {
  const { appId, appSecret } = getPrivyCredentials();
  return new PrivyClient({ appId, appSecret });
}

export function toPrivyHashHex(hash: Buffer): `0x${string}` {
  return `0x${hash.toString("hex")}`;
}

function decodeSignature(raw: string): Buffer {
  const hex = raw.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(raw, "base64");
}

function ownerExternalId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export async function createStellarWallet(
  userId: string
): Promise<PrivyStellarWallet> {
  const created = await getPrivyClient().wallets().create({
    chain_type: "stellar",
    external_id: ownerExternalId(userId),
    display_name: `Senda ${userId}`.slice(0, 80),
  });

  if (!created.id || !created.address) {
    throw new Error("Privy no devolvió id o address");
  }

  return { walletId: created.id, address: created.address };
}

export async function signStellarHash(
  walletId: string,
  hash: Buffer
): Promise<Buffer> {
  const signed = await getPrivyClient().wallets().rawSign(walletId, {
    params: { hash: toPrivyHashHex(hash) },
  });

  const signature = signed.signature;
  if (!signature) {
    throw new Error("Privy no devolvió firma");
  }
  return decodeSignature(signature);
}
