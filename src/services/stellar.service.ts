import axios from "axios";
import { Horizon, Keypair, Networks, rpc } from "@stellar/stellar-sdk";

export type StellarNetworkName = "testnet" | "public";

export interface StellarNetworkConfig {
  name: StellarNetworkName;
  horizonUrl: string;
  rpcUrl: string;
  friendbotUrl?: string;
  networkPassphrase: string;
}

export interface CreatedAccount {
  publicKey: string;
  secretKey: string;
}

const NETWORK_DEFAULTS: Record<StellarNetworkName, StellarNetworkConfig> = {
  testnet: {
    name: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    networkPassphrase: Networks.TESTNET,
  },
  public: {
    name: "public",
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: "https://soroban.stellar.org",
    networkPassphrase: Networks.PUBLIC,
  },
};

function resolveNetworkName(): StellarNetworkName {
  const raw = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  return raw === "public" || raw === "mainnet" ? "public" : "testnet";
}

export function getNetworkConfig(): StellarNetworkConfig {
  const defaults = NETWORK_DEFAULTS[resolveNetworkName()];

  return {
    ...defaults,
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? defaults.horizonUrl,
    rpcUrl: process.env.STELLAR_RPC_URL ?? defaults.rpcUrl,
    friendbotUrl: process.env.STELLAR_FRIENDBOT_URL ?? defaults.friendbotUrl,
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ?? defaults.networkPassphrase,
  };
}

export function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(getNetworkConfig().horizonUrl);
}

export function getRpcServer(): rpc.Server {
  return new rpc.Server(getNetworkConfig().rpcUrl);
}

export function createKeypair(): CreatedAccount {
  const keypair = Keypair.random();

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

export async function fundAccount(publicKey: string): Promise<void> {
  const { name, friendbotUrl } = getNetworkConfig();

  if (name !== "testnet" || !friendbotUrl) {
    throw new Error("Friendbot solo está disponible en Testnet");
  }

  await axios.get(friendbotUrl, {
    params: { addr: publicKey },
  });
}

export async function createAndFundAccount(): Promise<CreatedAccount> {
  const account = createKeypair();
  await fundAccount(account.publicKey);
  return account;
}

export async function loadAccount(publicKey: string) {
  return getHorizonServer().loadAccount(publicKey);
}
