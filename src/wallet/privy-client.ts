import { PrivyClient } from "@privy-io/node";

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

function getSessionSignerKey(): string {
  const key = process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Falta PRIVY_SESSION_SIGNER_PRIVATE_KEY. El usuario tiene que haber delegado el signer en /setup."
    );
  }
  return key;
}

function decodeSignature(raw: string): Buffer {
  const hex = raw.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(raw, "base64");
}

export async function signStellarHash(
  walletId: string,
  hash: Buffer
): Promise<Buffer> {
  const signed = await getPrivyClient().wallets().rawSign(walletId, {
    params: { hash: toPrivyHashHex(hash) },
    authorization_context: {
      authorization_private_keys: [getSessionSignerKey()],
    },
  });

  const signature =
    typeof signed === "object" && signed && "signature" in signed
      ? (signed as { signature?: string }).signature
      : undefined;
  if (!signature) {
    throw new Error("Privy no devolvió firma");
  }
  return decodeSignature(signature);
}
