import { Keypair } from "@stellar/stellar-sdk";
import { ensureUsdcTrustline, type UsdcWallet } from "../services/usdc.service";

export function getTreasuryKeypair(): Keypair {
  const secret = (
    process.env.STELLAR_TREASURY_SECRET_KEY?.trim() ||
    process.env.STELLAR_SECRET_KEY?.trim() ||
    ""
  );
  if (!secret) {
    throw new Error(
      "Falta STELLAR_TREASURY_SECRET_KEY o STELLAR_SECRET_KEY para la tesorería"
    );
  }
  return Keypair.fromSecret(secret);
}

export function getTreasuryPublicKey(): string {
  return getTreasuryKeypair().publicKey();
}

export function getTreasuryWallet(): UsdcWallet {
  const keypair = getTreasuryKeypair();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

let trustlineReady: Promise<void> | undefined;

export async function ensureTreasuryUsdcTrustline(): Promise<string> {
  if (!trustlineReady) {
    trustlineReady = ensureUsdcTrustline(getTreasuryWallet()).catch((error) => {
      trustlineReady = undefined;
      throw error;
    });
  }
  await trustlineReady;
  return getTreasuryPublicKey();
}

let treasuryChain: Promise<unknown> = Promise.resolve();

export function withTreasurySequence<T>(fn: () => Promise<T>): Promise<T> {
  const run = treasuryChain.then(fn, fn);
  treasuryChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
