import { createHmac, hkdfSync } from "crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { normalizePhoneIdentity } from "./identity.service";

const DERIVATION_SALT = "senda-sep30-v1";
const RECOVERY_SALT = "senda-sep30-recovery-v1";

function getMasterSecret(): Buffer {
  const dedicated = process.env.CUSTODY_MASTER_SECRET?.trim();
  const fallback = process.env.STELLAR_SECRET_KEY?.trim();
  const raw = dedicated || fallback;

  if (!raw) {
    throw new Error(
      "Falta CUSTODY_MASTER_SECRET (o STELLAR_SECRET_KEY) para derivar cuentas"
    );
  }

  return Buffer.from(raw, "utf8");
}

function deriveSeed(salt: string, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", getMasterSecret(), salt, info, 32));
}

export function deriveUserKeypair(phone: string): Keypair {
  const identity = normalizePhoneIdentity(phone);
  const seed = deriveSeed(DERIVATION_SALT, `whatsapp:${identity}`);
  return Keypair.fromRawEd25519Seed(seed);
}

export function deriveRecoveryKeypair(phone: string): Keypair {
  const identity = normalizePhoneIdentity(phone);
  const seed = deriveSeed(RECOVERY_SALT, `whatsapp-recovery:${identity}`);
  return Keypair.fromRawEd25519Seed(seed);
}

export function logicalPasskeyId(phone: string): string {
  const identity = normalizePhoneIdentity(phone);
  const digest = createHmac("sha256", getMasterSecret())
    .update(`passkey:${identity}`)
    .digest("hex")
    .slice(0, 24);
  return `pk_whatsapp_${digest}`;
}

export function accountFromDerivedPhone(phone: string): {
  publicKey: string;
  secretKey: string;
} {
  const keypair = deriveUserKeypair(phone);
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}
