import { Buffer } from "buffer";

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

function privyHeaders(): Record<string, string> {
  const { appId, appSecret } = getPrivyCredentials();
  const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    "privy-app-id": appId,
    "Content-Type": "application/json",
  };
}

function decodeSignature(raw: string): Buffer {
  const hex = raw.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(raw, "base64");
}

export async function createStellarWallet(
  userId: string
): Promise<PrivyStellarWallet> {
  const response = await fetch("https://api.privy.io/v1/wallets", {
    method: "POST",
    headers: privyHeaders(),
    body: JSON.stringify({
      chain_type: "stellar",
      owner_id: userId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Privy no pudo crear la wallet (${response.status})`);
  }

  const created = (await response.json()) as { id?: string; address?: string };
  if (!created.id || !created.address) {
    throw new Error("Privy no devolvió id o address");
  }
  return { walletId: created.id, address: created.address };
}

export async function signStellarHash(
  walletId: string,
  hash: Buffer
): Promise<Buffer> {
  const response = await fetch(
    `https://api.privy.io/v1/wallets/${walletId}/raw_sign`,
    {
      method: "POST",
      headers: privyHeaders(),
      body: JSON.stringify({
        params: { hash: `0x${hash.toString("hex")}` },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Privy no pudo firmar el hash (${response.status})`);
  }

  const body = (await response.json()) as {
    signature?: string;
    data?: { signature?: string };
  };
  const signature = body.signature ?? body.data?.signature;
  if (!signature) {
    throw new Error("Privy no devolvió firma");
  }
  return decodeSignature(signature);
}
