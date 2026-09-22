import {
  Address,
  Asset,
  BASE_FEE,
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

export const USDC_DECIMALS = 7;
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

export const DEFAULT_USDC_SAC_ID =
  "CDT2MY3QNV2RT2XULQWWXX2JELUWRWNXNKONCYG5MTIGZM7G5S2QNNGB";

const DEFAULT_USDC_CODE = "USDC";
const DEFAULT_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const MAX_USDC_PER_OPERATION = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`USDC intento ${attempt}/${attempts} falló:`, error);
      if (attempt < attempts) {
        await sleep(400 * attempt);
      }
    }
  }
  throw lastError;
}

export interface UsdcWallet {
  publicKey: string;
  secretKey: string;
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

export function getUsdcAsset(): Asset {
  const code = process.env.USDC_CODE?.trim() || DEFAULT_USDC_CODE;
  const issuer = process.env.USDC_ISSUER?.trim() || DEFAULT_USDC_ISSUER;
  return new Asset(code, issuer);
}

export function getUsdcSacId(): string {
  return process.env.USDC_SAC_CONTRACT_ID?.trim() || DEFAULT_USDC_SAC_ID;
}

export function toUsdcStroops(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto de USDC debe ser mayor a 0");
  }
  return BigInt(Math.round(amount * Number(USDC_SCALE)));
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
    const amount = Number(line.balance);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0n;
    }
    return toUsdcStroops(amount);
  } catch {
    return 0n;
  }
}

export async function getUsdcBalance(publicKey: string): Promise<bigint> {
  const server = getRpcServer();
  const sacId = getUsdcSacId();
  const passphrase = getNetworkPassphrase();

  try {
    const { result } = await server.queryContract<bigint | number | string>(
      sacId,
      "balance",
      { id: publicKey },
      passphrase
    );
    return BigInt(result);
  } catch {
    try {
      const account = await server.getAccount(publicKey);
      const contract = new Contract(sacId);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
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
        return BigInt(scValToNative(simulation.result.retval));
      }
    } catch (error) {
      console.error("SAC balance fallback:", error);
    }

    return getHorizonUsdcBalance(publicKey);
  }
}

export async function ensureUsdcTrustline(wallet: UsdcWallet): Promise<void> {
  await withRetry(async () => {
    const horizon = getHorizonServer();
    const asset = getUsdcAsset();
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
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(60)
      .build();

    tx.sign(Keypair.fromSecret(wallet.secretKey));
    try {
      await horizon.submitTransaction(tx);
    } catch (error) {
      const details = JSON.stringify(error);
      if (
        details.includes("op_already_exists") ||
        details.includes("already")
      ) {
        return;
      }
      throw error;
    }
  });
}

async function transferUsdcViaHorizon(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number
): Promise<string> {
  const signer = Keypair.fromSecret(from.secretKey);
  const horizon = getHorizonServer();
  const source = await horizon.loadAccount(from.publicKey);
  const asset = getUsdcAsset();

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: toPublicKey,
        asset,
        amount: amount.toFixed(7),
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(signer);
  const result = await horizon.submitTransaction(tx);
  return result.hash;
}

async function transferUsdcViaSac(
  from: UsdcWallet,
  toPublicKey: string,
  stroops: bigint
): Promise<string> {
  const signer = Keypair.fromSecret(from.secretKey);
  const server = getRpcServer();
  const account = await server.getAccount(from.publicKey);
  const contract = new Contract(getUsdcSacId());

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
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

  const prepared = await server.prepareTransaction(built);
  prepared.sign(signer);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    const detail = JSON.stringify(sent.errorResult ?? sent);
    throw new Error(`SAC HostError transfer rejected ${detail}`);
  }

  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`SAC HostError transfer ${confirmed.status}`);
  }

  return sent.hash;
}

async function submitUsdcTransfer(
  from: UsdcWallet,
  toPublicKey: string,
  amount: number,
  balanceOf: string
): Promise<UsdcTransferResult> {
  if (amount > MAX_USDC_PER_OPERATION) {
    amount = MAX_USDC_PER_OPERATION;
  }

  const stroops = toUsdcStroops(amount);

  const txHash = await withRetry(async () => {
    try {
      return await transferUsdcViaSac(from, toPublicKey, stroops);
    } catch (sacError) {
      console.error("SAC transfer, intento Horizon USDC:", sacError);
      return transferUsdcViaHorizon(from, toPublicKey, amount);
    }
  });

  const balance = await getUsdcBalance(balanceOf);

  return {
    from: from.publicKey,
    to: toPublicKey,
    amountUsdc: fromUsdcStroops(stroops),
    amountStroops: stroops.toString(),
    txHash,
    balanceUsdc: fromUsdcStroops(balance),
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
