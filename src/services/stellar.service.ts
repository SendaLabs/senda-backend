import axios from "axios";
import {
  Address,
  Asset,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import { usePrivyWallets } from "../config/flags";
import { resolvePrivyAccount } from "../wallet/privy-account";
import { resolveCustodialAccount } from "./custody.service";
import { getInclusionFee } from "./fees.service";
import {
  ensureUsdcTrustline,
  fromUsdcStroops,
  getUsdcBalance,
  getUsdcSacId,
  transferUsdc,
  USDC_SCALE,
} from "./usdc.service";
import { logSafeError } from "./whatsapp.service";

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
  privyWalletId?: string;
  privyUserId?: string;
  phone?: string;
}

export interface CreditOnChainResult {
  publicKey: string;
  amountUsdc: string;
  usdcBalance: string;
  usdcTxHash: string;
  nativeBalanceXlm: string;
  usdcError?: string;
}

export interface UserOnChainState {
  network: StellarNetworkName;
  publicKey: string;
  nativeBalanceXlm: string;
  usdcBalance?: string;
  usdcSacId?: string;
  latestLedger?: number;
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

const MAX_XLM_PER_OPERATION = 500;

function resolveNetworkName(): StellarNetworkName {
  const raw = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  return raw === "public" || raw === "mainnet" ? "public" : "testnet";
}

export function getNetworkConfig(): StellarNetworkConfig {
  const name = resolveNetworkName();
  const defaults = NETWORK_DEFAULTS[name];
  const networkPassphrase =
    process.env.STELLAR_NETWORK_PASSPHRASE ?? defaults.networkPassphrase;

  if (networkPassphrase !== defaults.networkPassphrase) {
    throw new Error(
      `STELLAR_NETWORK=${name} no coincide con STELLAR_NETWORK_PASSPHRASE`
    );
  }

  return {
    ...defaults,
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? defaults.horizonUrl,
    rpcUrl: process.env.STELLAR_RPC_URL ?? defaults.rpcUrl,
    friendbotUrl: process.env.STELLAR_FRIENDBOT_URL ?? defaults.friendbotUrl,
    networkPassphrase,
  };
}

export function assertNetworkConsistency(): void {
  const config = getNetworkConfig();
  const horizon = config.horizonUrl.toLowerCase();
  const rpcUrl = config.rpcUrl.toLowerCase();

  if (config.name === "testnet") {
    if (horizon.includes("horizon.stellar.org") && !horizon.includes("testnet")) {
      throw new Error("Horizon de public no se puede usar con STELLAR_NETWORK=testnet");
    }
    if (rpcUrl.includes("soroban.stellar.org") && !rpcUrl.includes("testnet")) {
      throw new Error("RPC de public no se puede usar con STELLAR_NETWORK=testnet");
    }
    return;
  }

  if (horizon.includes("testnet") || rpcUrl.includes("testnet")) {
    throw new Error("URLs de Testnet no se pueden usar con STELLAR_NETWORK=public");
  }
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

export function getConfiguredContractId(): string | undefined {
  const contractId = process.env.STELLAR_CONTRACT_ID?.trim();
  return contractId || undefined;
}

function getOpsKeypair(): Keypair {
  const secret = process.env.STELLAR_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Falta STELLAR_SECRET_KEY. Configurá la cuenta operativa de Testnet."
    );
  }

  return Keypair.fromSecret(secret);
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

async function ensureFunded(publicKey: string): Promise<void> {
  try {
    await loadAccount(publicKey);
    return;
  } catch {
    try {
      await fundAccount(publicKey);
    } catch (error) {
      logSafeError("Friendbot", error);
      await sleepQuiet(800);
      await loadAccount(publicKey);
    }
  }
}

function sleepQuiet(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createAndFundAccount(): Promise<CreatedAccount> {
  const account = createKeypair();
  await fundAccount(account.publicKey);
  return account;
}

export async function loadAccount(publicKey: string) {
  return getHorizonServer().loadAccount(publicKey);
}

export async function getNativeBalance(publicKey: string): Promise<string> {
  const account = await loadAccount(publicKey);
  const native = account.balances.find(
    (balance) => balance.asset_type === "native"
  );
  return native?.balance ?? "0";
}

function formatXlmAmount(amount: number): string {
  return amount.toFixed(7);
}

export async function getOrCreateUserAccount(
  phone: string
): Promise<CreatedAccount> {
  if (usePrivyWallets()) {
    const account = await resolvePrivyAccount(phone);
    await ensureFunded(account.publicKey);
    return { ...account, phone };
  }

  const { account } = await resolveCustodialAccount(phone);
  await ensureFunded(account.publicKey);
  return { ...account, phone };
}

async function submitHorizonPayment(
  destination: string,
  amountXlm: number
): Promise<string> {
  const ops = getOpsKeypair();
  const { networkPassphrase } = getNetworkConfig();
  const horizon = getHorizonServer();
  const source = await horizon.loadAccount(ops.publicKey());
  const amount = formatXlmAmount(amountXlm);

  let destinationExists = true;
  try {
    await horizon.loadAccount(destination);
  } catch {
    destinationExists = false;
  }

  const builder = new TransactionBuilder(source, {
    fee: await getInclusionFee(destinationExists ? 1 : 1),
    networkPassphrase,
  });

  if (destinationExists) {
    builder.addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      })
    );
  } else {
    const startingBalance = amountXlm < 1 ? "1" : amount;
    builder.addOperation(
      Operation.createAccount({
        destination,
        startingBalance,
      })
    );
  }

  const transaction = builder.setTimeout(60).build();
  transaction.sign(ops);

  const result = await horizon.submitTransaction(transaction);
  return result.hash;
}

async function submitContractCredit(
  userPublicKey: string,
  amountCents: bigint
): Promise<{ hash: string; balanceCents: string }> {
  const contractId = getConfiguredContractId();
  if (!contractId) {
    throw new Error("Falta STELLAR_CONTRACT_ID");
  }

  const ops = getOpsKeypair();
  const { networkPassphrase } = getNetworkConfig();
  const server = getRpcServer();
  const source = await server.getAccount(ops.publicKey());
  const contract = new Contract(contractId);

  const built = new TransactionBuilder(source, {
    fee: await getInclusionFee(),
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "credit",
        Address.fromString(userPublicKey).toScVal(),
        nativeToScVal(amountCents, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(built);
  prepared.sign(ops);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error("La red rechazó la invocación del contrato Soroban");
  }

  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`El contrato no confirmó el crédito (${confirmed.status})`);
  }

  const balanceCents = await getContractBalanceCents(userPublicKey);
  return { hash: sent.hash, balanceCents };
}

export async function getContractBalanceCents(
  userPublicKey: string
): Promise<string> {
  const contractId = getConfiguredContractId();
  if (!contractId) {
    throw new Error("Falta STELLAR_CONTRACT_ID");
  }

  const { rpcUrl, networkPassphrase } = getNetworkConfig();
  const server = new rpc.Server(rpcUrl);
  const { result } = await server.queryContract<bigint | number | string>(
    contractId,
    "balance",
    { user: userPublicKey },
    networkPassphrase
  );

  return String(result);
}

export async function creditUserOnTestnet(
  phone: string,
  usdAmount: number
): Promise<CreditOnChainResult> {
  if (
    getNetworkConfig().name === "public" &&
    process.env.ENABLE_PUBLIC_CREDIT !== "true"
  ) {
    throw new Error(
      "El crédito automático solo está habilitado en Testnet"
    );
  }

  const user = await getOrCreateUserAccount(phone);
  try {
    await loadAccount(getOpsKeypair().publicKey());
  } catch {
    throw new Error(
      "La cuenta operativa no está fondeada. No se acredita USDC a ciegas."
    );
  }
  await ensureUsdcTrustline(user);
  await sleepQuiet(400);

  const transfer = await transferUsdc(user.publicKey, usdAmount);
  try {
    const opsBalance = await getUsdcBalance(getOpsKeypair().publicKey());
    if (opsBalance < USDC_SCALE * 50n) {
      logSafeError(
        "operativa USDC baja",
        new Error(`saldo=${fromUsdcStroops(opsBalance)}`)
      );
    }
  } catch (error) {
    logSafeError("operativa USDC, no se pudo medir el saldo", error);
  }
  let nativeBalanceXlm = "0";
  try {
    nativeBalanceXlm = await getNativeBalance(user.publicKey);
  } catch {
    nativeBalanceXlm = "0";
  }

  return {
    publicKey: user.publicKey,
    amountUsdc: transfer.amountUsdc,
    usdcBalance: transfer.balanceUsdc,
    usdcTxHash: transfer.txHash,
    nativeBalanceXlm,
  };
}

export async function getUserOnChainState(
  phone: string
): Promise<UserOnChainState> {
  const wallet = await getOrCreateUserAccount(phone);
  try {
    await ensureUsdcTrustline(wallet);
  } catch (error) {
    logSafeError("Trustline al consultar saldo", error);
  }

  const config = getNetworkConfig();
  let nativeBalanceXlm = "0";
  try {
    nativeBalanceXlm = await getNativeBalance(wallet.publicKey);
  } catch {
    nativeBalanceXlm = "0";
  }

  const usdc = await getUsdcBalance(wallet.publicKey);

  return {
    network: config.name,
    publicKey: wallet.publicKey,
    nativeBalanceXlm,
    usdcSacId: getUsdcSacId(),
    usdcBalance: fromUsdcStroops(usdc),
  };
}

export function explorerTxUrl(hash: string): string {
  const network = resolveNetworkName() === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

export function explorerAccountUrl(publicKey: string): string {
  const network = resolveNetworkName() === "public" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/account/${publicKey}`;
}

export function formatCentsAsUsd(cents: string): string {
  const value = Number(cents) / 100;
  if (!Number.isFinite(value)) {
    return cents;
  }
  return value.toFixed(2);
}
