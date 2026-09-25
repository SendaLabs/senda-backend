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
  scValToNative,
} from "@stellar/stellar-sdk";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { getInclusionFee } from "./fees.service";
import { logSafeError } from "./whatsapp.service";

export const USDC_DECIMALS = 7;
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

export const DEFAULT_USDC_SAC_ID =
  "CDT2MY3QNV2RT2XULQWWXX2JELUWRWNXNKONCYG5MTIGZM7G5S2QNNGB";

const DEFAULT_USDC_CODE = "USDC";
const DEFAULT_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const MAX_USDC_PER_OPERATION = 500;

export class UsdcBalanceUnavailableError extends Error {
  constructor(message = "No se pudo consultar el saldo de USDC") {
    super(message);
    this.name = "UsdcBalanceUnavailableError";
  }
}

export class SacUnconfirmedError extends Error {
  readonly hash: string;

  constructor(hash: string) {
    super("La transferencia está pendiente. No reenviamos el pago.");
    this.name = "SacUnconfirmedError";
    this.hash = hash;
  }
}

export class AmountLimitError extends Error {
  constructor() {
    super("El monto supera el máximo por operación");
    this.name = "AmountLimitError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UsdcWallet {
  publicKey: string;
  secretKey?: string;
  privyWalletId?: string;
  phone?: string;
}

export interface UsdcTransferResult {
  from: string;
  to: string;
  amountUsdc: string;
  amountStroops: string;
  txHash: string;
  balanceUsdc: string;
}

function getNetworkPassphrase(): string {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    (process.env.STELLAR_NETWORK === "public"
      ? Networks.PUBLIC
      : Networks.TESTNET)
  );
}

function getRpcServer(): rpc.Server {
  return new rpc.Server(
    process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org"
  );
}

function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
  );
}

function getOpsKeypair(): Keypair {
  const secret = process.env.STELLAR_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error(
      "Falta STELLAR_SECRET_KEY para firmar transferencias de USDC"
    );
  }
  return Keypair.fromSecret(secret);
}

function isAccountMissing(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /not found|404|resource missing/i.test(text);
}

export function getUsdcAsset(): Asset {
  const code = process.env.USDC_CODE?.trim() || DEFAULT_USDC_CODE;
  const issuer = process.env.USDC_ISSUER?.trim() || DEFAULT_USDC_ISSUER;
  return new Asset(code, issuer);
}

export function getUsdcSacId(): string {
  return process.env.USDC_SAC_CONTRACT_ID?.trim() || DEFAULT_USDC_SAC_ID;
}

export function toUsdcStroops(
  amount: number | string,
  options?: { allowZero?: boolean }
): bigint {
  const normalized =
    typeof amount === "number"
      ? Number.isFinite(amount) && amount >= 0
        ? amount.toFixed(USDC_DECIMALS)
        : ""
      : amount.trim();

  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("El monto de USDC debe ser mayor a 0");
  }

  const [whole, frac = ""] = normalized.split(".");
  if (frac.length > USDC_DECIMALS && /[1-9]/.test(frac.slice(USDC_DECIMALS))) {
    throw new Error("El monto de USDC tiene demasiados decimales");
  }

  const padded = frac.slice(0, USDC_DECIMALS).padEnd(USDC_DECIMALS, "0");
  const stroops = BigInt(whole) * USDC_SCALE + BigInt(padded || "0");
  if (stroops < 0n || (!options?.allowZero && stroops === 0n)) {
    throw new Error("El monto de USDC debe ser mayor a 0");
  }
  return stroops;
}

export function fromUsdcStroops(raw: bigint | number | string): string {
  const value = BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / USDC_SCALE;
  const fraction = abs % USDC_SCALE;
  const formatted = `${whole}.${fraction
    .toString()
    .padStart(USDC_DECIMALS, "0")}`.replace(/\.?0+$/, "");
  return `${negative ? "-" : ""}${formatted || "0"}`;
}

export async function getHorizonUsdcBalance(publicKey: string): Promise<bigint> {
  try {
    const asset = getUsdcAsset();
    const account = await getHorizonServer().loadAccount(publicKey);
    const line = account.balances.find(
      (balance) =>
        "asset_code" in balance &&
        balance.asset_code === asset.code &&
        balance.asset_issuer === asset.issuer
    );
    if (!line || !("balance" in line)) {
      return 0n;
    }
    return toUsdcStroops(line.balance, { allowZero: true });
  } catch (error) {
    if (isAccountMissing(error)) {
      return 0n;
    }
    throw new UsdcBalanceUnavailableError();
  }
}

export function pickReportedUsdcBalance(sac: bigint, horizon: bigint): bigint {
  return sac > horizon ? sac : horizon;
}

export async function getUsdcBalance(publicKey: string): Promise<bigint> {
  const server = getRpcServer();
  const sacId = getUsdcSacId();
  const passphrase = getNetworkPassphrase();
  let sac = 0n;
  let sacResolved = false;

  try {
    const { result } = await server.queryContract<bigint | number | string>(
      sacId,
      "balance",
      { id: publicKey },
      passphrase
    );
    sac = BigInt(result);
    sacResolved = true;
  } catch {
    try {
      const account = await server.getAccount(publicKey);
      const contract = new Contract(sacId);
      const tx = new TransactionBuilder(account, {
        fee: await getInclusionFee(),
        networkPassphrase: passphrase,
      })
        .addOperation(
          contract.call("balance", Address.fromString(publicKey).toScVal())
        )
        .setTimeout(30)
        .build();

      const simulation = await server.simulateTransaction(tx);
      if (
        rpc.Api.isSimulationSuccess(simulation) &&
        simulation.result?.retval
      ) {
        sac = BigInt(scValToNative(simulation.result.retval));
        sacResolved = true;
      }
    } catch (error) {
      if (!isAccountMissing(error)) {
        logSafeError("SAC balance", error);
      }
    }
  }

  const horizon = await getHorizonUsdcBalance(publicKey);
  if (sacResolved) {
    return pickReportedUsdcBalance(sac, horizon);
  }
  return horizon;
}

export async function ensureUsdcTrustline(wallet: UsdcWallet): Promise<void> {
  const horizon = getHorizonServer();
  const asset = getUsdcAsset();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const account = await horizon.loadAccount(wallet.publicKey);
    const hasTrustline = account.balances.some(
      (balance) =>
        "asset_code" in balance &&
        balance.asset_code === asset.code &&
        balance.asset_issuer === asset.issuer
    );
    if (hasTrustline) {
      return;
    }

    const tx = new TransactionBuilder(account, {
      fee: await getInclusionFee(),
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(60)
      .build();

    await signStellarTransaction(wallet, tx);
    try {
      await horizon.submitTransaction(tx);
      return;
    } catch (error) {
      const details = error instanceof Error ? error.message : "";
      if (/op_already_exists|already/i.test(details)) {
        return;
      }
      logSafeError("USDC trustline", error);
      if (attempt === 3) {
        throw error;
      }
      await sleep(400 * attempt);
    }
  }
}

async function transferUsdcViaHorizon(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number
): Promise<string> {
  const horizon = getHorizonServer();
  const source = await horizon.loadAccount(from.publicKey);
  const asset = getUsdcAsset();

  const tx = new TransactionBuilder(source, {
    fee: await getInclusionFee(),
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: toPublicKey,
        asset,
        amount: fromUsdcStroops(toUsdcStroops(amount)),
      })
    )
    .setTimeout(60)
    .build();

  await signStellarTransaction(from, tx);
  const result = await horizon.submitTransaction(tx);
  return result.hash;
}

async function recoverSacHash(
  server: rpc.Server,
  hash: string
): Promise<boolean> {
  const confirmed = await server.getTransaction(hash);
  if (confirmed.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return true;
  }
  if (confirmed.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error("SAC transfer FAILED");
  }
  return false;
}

async function transferUsdcViaSac(
  from: UsdcWallet,
  toPublicKey: string,
  stroops: bigint
): Promise<string> {
  const server = getRpcServer();
  const account = await server.getAccount(from.publicKey);
  const contract = new Contract(getUsdcSacId());

  const built = new TransactionBuilder(account, {
    fee: await getInclusionFee(),
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      contract.call(
        "transfer",
        Address.fromString(from.publicKey).toScVal(),
        Address.fromString(toPublicKey).toScVal(),
        nativeToScVal(stroops, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error("La simulación SAC rechazó la transferencia");
  }

  const prepared = await server.prepareTransaction(built);
  await signStellarTransaction(from, prepared);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || !sent.hash) {
    throw new Error("SAC rechazó la transferencia antes de incluirla");
  }

  try {
    const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (confirmed.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return sent.hash;
    }
    if (confirmed.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("SAC transfer FAILED");
    }
    throw new SacUnconfirmedError(sent.hash);
  } catch (error) {
    if (error instanceof SacUnconfirmedError) {
      throw error;
    }
    if (error instanceof Error && error.message === "SAC transfer FAILED") {
      throw error;
    }
    throw new SacUnconfirmedError(sent.hash);
  }
}

export async function submitUsdcTransferOnce(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number,
  transferSac = transferUsdcViaSac,
  transferHorizon = transferUsdcViaHorizon,
  recoverHash = recoverSacHash
): Promise<string> {
  if (amount > MAX_USDC_PER_OPERATION) {
    throw new AmountLimitError();
  }

  const stroops = toUsdcStroops(amount);

  try {
    return await transferSac(from, toPublicKey, stroops);
  } catch (error) {
    if (error instanceof SacUnconfirmedError) {
      try {
        if (await recoverHash(getRpcServer(), error.hash)) {
          return error.hash;
        }
      } catch (recoverError) {
        if (
          recoverError instanceof Error &&
          recoverError.message === "SAC transfer FAILED"
        ) {
          throw recoverError;
        }
      }
      throw error;
    }

    logSafeError("SAC transfer, fallback Horizon", error);
    return transferHorizon(from, toPublicKey, amount);
  }
}

async function submitUsdcTransfer(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number,
  balanceOf: string
): Promise<UsdcTransferResult> {
  const stroops = toUsdcStroops(amount);
  const txHash = await submitUsdcTransferOnce(from, toPublicKey, amount);
  let balanceUsdc = fromUsdcStroops(stroops);
  try {
    let onChain = await getUsdcBalance(balanceOf);
    if (onChain === 0n) {
      await sleep(500);
      onChain = await getUsdcBalance(balanceOf);
    }
    if (onChain > 0n) {
      balanceUsdc = fromUsdcStroops(onChain);
    }
  } catch (error) {
    if (!(error instanceof UsdcBalanceUnavailableError)) {
      throw error;
    }
  }

  return {
    from: from.publicKey,
    to: toPublicKey,
    amountUsdc: fromUsdcStroops(stroops),
    amountStroops: stroops.toString(),
    txHash,
    balanceUsdc,
  };
}

export async function transferUsdc(
  toPublicKey: string,
  amount: number
): Promise<UsdcTransferResult> {
  const ops = getOpsKeypair();
  return submitUsdcTransfer(
    { publicKey: ops.publicKey(), secretKey: ops.secret() },
    toPublicKey,
    amount,
    toPublicKey
  );
}

export async function transferUsdcFromWallet(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number
): Promise<UsdcTransferResult> {
  return submitUsdcTransfer(from, toPublicKey, amount, from.publicKey);
}
