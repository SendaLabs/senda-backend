import { FeeBumpTransaction, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { getOrCreateUserAccount, getNetworkConfig } from "../services/stellar.service";
import { signStellarTransaction } from "../wallet/stellar-signer";

interface StellarToml {
  WEB_AUTH_ENDPOINT?: string;
  TRANSFER_SERVER_SEP0024?: string;
}

const tomlCache = new Map<string, StellarToml>();

export function getAnchorHomeDomain(): string {
  return (
    process.env.SEP24_HOME_DOMAIN?.trim() || "testanchor.stellar.org"
  ).replace(/^https?:\/\//, "");
}

export async function loadAnchorToml(
  homeDomain = getAnchorHomeDomain()
): Promise<StellarToml> {
  const cached = tomlCache.get(homeDomain);
  if (cached) {
    return cached;
  }

  const response = await fetch(
    `https://${homeDomain}/.well-known/stellar.toml`
  );
  if (!response.ok) {
    throw new Error("No se pudo leer el stellar.toml del ancla");
  }

  const text = await response.text();
  const toml: StellarToml = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(WEB_AUTH_ENDPOINT|TRANSFER_SERVER_SEP0024)\s*=\s*"?([^"]+)"?/);
    if (match?.[1] && match[2]) {
      toml[match[1] as keyof StellarToml] = match[2].trim();
    }
  }
  tomlCache.set(homeDomain, toml);
  return toml;
}

export async function getSep10Jwt(phone: string): Promise<string> {
  const user = await getOrCreateUserAccount(phone);
  const toml = await loadAnchorToml();
  const authUrl = toml.WEB_AUTH_ENDPOINT;
  if (!authUrl) {
    throw new Error("El ancla no publica WEB_AUTH_ENDPOINT");
  }

  const challengeUrl = new URL(authUrl);
  challengeUrl.searchParams.set("account", user.publicKey);
  const challengeRes = await fetch(challengeUrl);
  if (!challengeRes.ok) {
    throw new Error("El ancla no entregó el desafío SEP-10");
  }

  const challenge = (await challengeRes.json()) as {
    transaction?: string;
    network_passphrase?: string;
  };
  if (!challenge.transaction) {
    throw new Error("El desafío SEP-10 vino vacío");
  }

  const { networkPassphrase } = getNetworkConfig();
  const parsed = TransactionBuilder.fromXDR(
    challenge.transaction,
    challenge.network_passphrase || networkPassphrase
  );
  if (parsed instanceof FeeBumpTransaction || !(parsed instanceof Transaction)) {
    throw new Error("El desafío SEP-10 no es una transacción simple");
  }
  await signStellarTransaction(user, parsed);

  const tokenRes = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: parsed.toXDR() }),
  });
  if (!tokenRes.ok) {
    throw new Error("El ancla rechazó el desafío firmado");
  }

  const body = (await tokenRes.json()) as { token?: string };
  if (!body.token) {
    throw new Error("El ancla no devolvió JWT");
  }
  return body.token;
}
