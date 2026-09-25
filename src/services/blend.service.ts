import {
  Address,
  Contract,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  ensureUserRecord,
  findYieldPosition,
  upsertYieldPosition,
} from "../db/users.repository";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { getInclusionFee } from "./fees.service";
import { getNetworkConfig, getOrCreateUserAccount } from "./stellar.service";
import {
  fromUsdcStroops,
  getUsdcBalance,
  getUsdcSacId,
  toUsdcStroops,
} from "./usdc.service";

const DEFAULT_BLEND_POOL =
  "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";

// Collateral (2/3) y no Supply (0/1): el bot no abre deuda, solo deja USDC
// como colateral en el pool de Testnet para que rinda.
const RequestType = {
  SupplyCollateral: 2,
  WithdrawCollateral: 3,
};

function getPoolId(): string {
  return process.env.BLEND_POOL_ID?.trim() || DEFAULT_BLEND_POOL;
}

function getBlendUsdcId(): string {
  return process.env.BLEND_USDC_SAC_ID?.trim() || getUsdcSacId();
}

function rpcServer(): rpc.Server {
  return new rpc.Server(
    process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org"
  );
}

function loadBlendSdk(): {
  PoolContract: new (id: string) => {
    submit: (args: {
      from: string;
      spender: string;
      to: string;
      requests: Array<{
        amount: bigint;
        request_type: number;
        address: string;
      }>;
    }) => string;
  };
  RequestType: { SupplyCollateral: number; WithdrawCollateral: number };
} {
  try {
    return require("@blend-capital/blend-sdk") as ReturnType<typeof loadBlendSdk>;
  } catch {
    throw new Error(
      "No pude armar la operación de Blend. No mandamos nada a la red."
    );
  }
}

export function buildSubmitOperation(
  userPublicKey: string,
  stroops: bigint,
  requestType: number
): xdr.Operation {
  const blend = loadBlendSdk();
  const contract = new blend.PoolContract(getPoolId());
  return xdr.Operation.fromXDR(
    contract.submit({
      from: userPublicKey,
      spender: userPublicKey,
      to: userPublicKey,
      requests: [
        {
          amount: stroops,
          request_type:
            requestType === RequestType.SupplyCollateral
              ? blend.RequestType.SupplyCollateral
              : blend.RequestType.WithdrawCollateral,
          address: getBlendUsdcId(),
        },
      ],
    }),
    "base64"
  );
}

async function submitBlendRequest(
  phone: string,
  amount: number,
  requestType: number
): Promise<string> {
  const user = await getOrCreateUserAccount(phone);
  await ensureUserRecord(phone, user.publicKey);
  const stroops = toUsdcStroops(amount);

  if (requestType === RequestType.SupplyCollateral) {
    const available = await getUsdcBalance(user.publicKey);
    if (available < stroops) {
      throw new Error("No te alcanza el saldo para poner esa plata a rendir");
    }
  }

  const server = rpcServer();
  const { networkPassphrase } = getNetworkConfig();
  const account = await server.getAccount(user.publicKey);
  let operation: xdr.Operation;
  try {
    operation = buildSubmitOperation(user.publicKey, stroops, requestType);
  } catch (error) {
    throw new Error(
      "No pude armar la operación de Blend. No mandamos nada a la red."
    );
  }

  const built = new TransactionBuilder(account, {
    fee: await getInclusionFee(),
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error("No pude poner esa plata a rendir");
  }

  const prepared = await server.prepareTransaction(built);
  await signStellarTransaction(user, prepared);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || !sent.hash) {
    throw new Error("No pude poner esa plata a rendir");
  }
  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error("Blend quedó pendiente. No reenviamos el pago.");
  }
  return sent.hash;
}

export async function readBlendCollateralStroops(
  publicKey: string
): Promise<bigint> {
  const server = rpcServer();
  const { networkPassphrase } = getNetworkConfig();
  const account = await server.getAccount(publicKey);
  const pool = new Contract(getPoolId());
  const tx = new TransactionBuilder(account, {
    fee: await getInclusionFee(),
    networkPassphrase,
  })
    .addOperation(
      pool.call("get_positions", Address.fromString(publicKey).toScVal())
    )
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result?.retval) {
    throw new Error("No pude leer tu posición en Blend");
  }

  const native = scValToNative(simulation.result.retval) as {
    collateral?: Record<string, bigint | number | string>;
  };
  const reserve = getBlendUsdcId();
  const raw =
    native.collateral?.[reserve] ??
    Object.values(native.collateral ?? {})[0] ??
    0;
  return BigInt(raw);
}

async function syncYieldFromChain(phone: string, publicKey: string) {
  const stroops = await readBlendCollateralStroops(publicKey);
  const value = fromUsdcStroops(stroops);
  await upsertYieldPosition(phone, stroops.toString(), value);
  return { suppliedUsdc: value, currentValueUsdc: value };
}

export async function supplyToBlend(
  phone: string,
  amount: number
): Promise<{ amountUsdc: string; valueUsdc: string; txHash: string }> {
  const txHash = await submitBlendRequest(
    phone,
    amount,
    RequestType.SupplyCollateral
  );
  const user = await getOrCreateUserAccount(phone);
  try {
    const position = await syncYieldFromChain(phone, user.publicKey);
    return {
      amountUsdc: fromUsdcStroops(toUsdcStroops(amount)),
      valueUsdc: position.currentValueUsdc,
      txHash,
    };
  } catch {
    return {
      amountUsdc: fromUsdcStroops(toUsdcStroops(amount)),
      valueUsdc: fromUsdcStroops(toUsdcStroops(amount)),
      txHash,
    };
  }
}

export async function withdrawFromBlend(
  phone: string,
  amount: number
): Promise<{ amountUsdc: string; valueUsdc: string; txHash: string }> {
  const txHash = await submitBlendRequest(
    phone,
    amount,
    RequestType.WithdrawCollateral
  );
  const user = await getOrCreateUserAccount(phone);
  try {
    const position = await syncYieldFromChain(phone, user.publicKey);
    return {
      amountUsdc: fromUsdcStroops(toUsdcStroops(amount)),
      valueUsdc: position.currentValueUsdc,
      txHash,
    };
  } catch {
    return {
      amountUsdc: fromUsdcStroops(toUsdcStroops(amount)),
      valueUsdc: "0",
      txHash,
    };
  }
}

export async function getBlendPosition(phone: string): Promise<{
  suppliedUsdc: string;
  currentValueUsdc: string;
}> {
  const user = await getOrCreateUserAccount(phone);
  try {
    return await syncYieldFromChain(phone, user.publicKey);
  } catch {
    const stored = await findYieldPosition(phone);
    if (!stored) {
      return { suppliedUsdc: "0", currentValueUsdc: "0" };
    }
    return {
      suppliedUsdc: /^\d+$/.test(stored.bUsdcBalance)
        ? fromUsdcStroops(BigInt(stored.bUsdcBalance))
        : stored.bUsdcBalance,
      currentValueUsdc: stored.lastSyncedValueUsdc,
    };
  }
}
