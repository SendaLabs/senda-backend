import {
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { getInclusionFee } from "./fees.service";
import {
  ensureUserRecord,
  findYieldPosition,
  upsertYieldPosition,
} from "../db/users.repository";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { getOrCreateUserAccount, getNetworkConfig } from "./stellar.service";
import { getUsdcSacId, toUsdcStroops } from "./usdc.service";

const DEFAULT_BLEND_POOL =
  "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";

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

async function submitBlendRequest(
  phone: string,
  amount: number,
  requestType: number
): Promise<string> {
  const user = await getOrCreateUserAccount(phone);
  await ensureUserRecord(phone, user.publicKey);
  const server = rpcServer();
  const { networkPassphrase } = getNetworkConfig();
  const account = await server.getAccount(user.publicKey);
  const pool = new Contract(getPoolId());
  const stroops = toUsdcStroops(amount);

  let operation: xdr.Operation;
  try {
    const blend = require("@blend-capital/blend-sdk") as {
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
    };
    const contract = new blend.PoolContract(getPoolId());
    operation = xdr.Operation.fromXDR(
      contract.submit({
        from: user.publicKey,
        spender: user.publicKey,
        to: user.publicKey,
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
  } catch {
    operation = pool.call(
      "submit",
      Address.fromString(user.publicKey).toScVal(),
      Address.fromString(user.publicKey).toScVal(),
      Address.fromString(user.publicKey).toScVal(),
      nativeToScVal([
        {
          request_type: requestType,
          address: getBlendUsdcId(),
          amount: stroops,
        },
      ])
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
    throw new Error("La simulación de Blend rechazó la operación");
  }

  const prepared = await server.prepareTransaction(built);
  await signStellarTransaction(user, prepared);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || !sent.hash) {
    throw new Error("Blend rechazó la operación");
  }
  try {
    const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
    if (confirmed.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return sent.hash;
    }
    if (confirmed.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("Blend no confirmó la operación");
    }
    throw new Error("Blend quedó pendiente. No reenviamos el pago.");
  } catch (error) {
    if (error instanceof Error && /pendiente|no confirmó/.test(error.message)) {
      throw error;
    }
    throw new Error("Blend quedó pendiente. No reenviamos el pago.");
  }
}

export async function supplyToBlend(
  phone: string,
  amount: number
): Promise<{ amountUsdc: string; valueUsdc: string }> {
  await submitBlendRequest(phone, amount, RequestType.SupplyCollateral);
  const current = (await findYieldPosition(phone))?.lastSyncedValueUsdc ?? "0";
  const next = (Number(current) + amount).toFixed(2);
  await upsertYieldPosition(phone, next, next);
  return { amountUsdc: String(amount), valueUsdc: next };
}

export async function withdrawFromBlend(
  phone: string,
  amount: number
): Promise<{ amountUsdc: string; valueUsdc: string }> {
  await submitBlendRequest(phone, amount, RequestType.WithdrawCollateral);
  const current = Number(
    (await findYieldPosition(phone))?.lastSyncedValueUsdc ?? "0"
  );
  const next = Math.max(0, current - amount).toFixed(2);
  await upsertYieldPosition(phone, next, next);
  return { amountUsdc: String(amount), valueUsdc: next };
}

export async function getBlendPosition(phone: string): Promise<{
  suppliedUsdc: string;
  currentValueUsdc: string;
}> {
  const stored = await findYieldPosition(phone);
  const value = stored?.lastSyncedValueUsdc ?? "0";
  return {
    suppliedUsdc: stored?.bUsdcBalance ?? "0",
    currentValueUsdc: value,
  };
}

