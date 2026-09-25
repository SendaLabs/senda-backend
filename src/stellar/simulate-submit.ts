import {
  Keypair,
  TransactionBuilder,
  rpc,
  type Transaction,
  type xdr,
} from "@stellar/stellar-sdk";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { getInclusionFee } from "../services/fees.service";
import { getNetworkConfig, getRpcServer } from "../services/stellar.service";
import { withTreasurySequence, getTreasuryWallet } from "./treasury";

export async function simulateThenSubmit(options: {
  sourcePublicKey: string;
  signWith: { publicKey: string; secretKey?: string; privyWalletId?: string };
  operation: xdr.Operation;
  timeout?: number;
}): Promise<string> {
  const server = getRpcServer();
  const { networkPassphrase } = getNetworkConfig();
  const account = await server.getAccount(options.sourcePublicKey);

  const built = new TransactionBuilder(account, {
    fee: await getInclusionFee(),
    networkPassphrase,
  })
    .addOperation(options.operation)
    .setTimeout(options.timeout ?? 60)
    .build();

  const simulated = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error("La simulación Soroban rechazó la transacción");
  }

  const prepared = (await server.prepareTransaction(built)) as Transaction;
  await signStellarTransaction(options.signWith, prepared);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR" || !sent.hash) {
    throw new Error("La red rechazó la transacción Soroban");
  }

  const confirmed = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Soroban no confirmó (${confirmed.status})`);
  }
  return sent.hash;
}

export async function treasurySimulateThenSubmit(
  operation: xdr.Operation
): Promise<string> {
  const wallet = getTreasuryWallet();
  return withTreasurySequence(() =>
    simulateThenSubmit({
      sourcePublicKey: wallet.publicKey,
      signWith: wallet,
      operation,
    })
  );
}

export function assertTreasuryKeypair(secret: string): string {
  return Keypair.fromSecret(secret).publicKey();
}
