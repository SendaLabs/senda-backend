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
      rpc.Api.isSimulationError(simulation) ||
      !rpc.Api.isSimulationSuccess(simulation) ||
      !simulation.result?.retval
    ) {
      throw new Error("No se pudo leer el balance USDC del SAC");
    }

    return BigInt(scValToNative(simulation.result.retval));
  }
}

export async function ensureUsdcTrustline(wallet: UsdcWallet): Promise<void> {
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
  await horizon.submitTransaction(tx);
}

export async function transferUsdc(
  toPublicKey: string,
  amount: number
): Promise<UsdcTransferResult> {
  if (amount > MAX_USDC_PER_OPERATION) {
    throw new Error(
      `El máximo por operación es ${MAX_USDC_PER_OPERATION} USDC`
    );
  }

  const ops = getOpsKeypair();
  const stroops = toUsdcStroops(amount);
  const server = getRpcServer();
  const account = await server.getAccount(ops.publicKey());
  const contract = new Contract(getUsdcSacId());

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      contract.call(
        "transfer",
        Address.fromString(ops.publicKey()).toScVal(),
        Address.fromString(toPublicKey).toScVal(),
        nativeToScVal(stroops, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(built);
  prepared.sign(ops);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new Error("La red rechazó la transferencia USDC del SAC");
  }

  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`La transferencia USDC no confirmó (${confirmed.status})`);
  }

  const balance = await getUsdcBalance(toPublicKey);

  return {
    from: ops.publicKey(),
    to: toPublicKey,
    amountUsdc: fromUsdcStroops(stroops),
    amountStroops: stroops.toString(),
    txHash: sent.hash,
    balanceUsdc: fromUsdcStroops(balance),
  };
}
