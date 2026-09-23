import {
  Asset,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  createTransaction,
  ensureUserRecord,
  updateTransactionStatus,
} from "../db/users.repository";
import { getSep10Jwt } from "../sep/sep10";
import { pollTransactionStatus, startWithdraw } from "../sep/sep24";
import { getInclusionFee } from "./fees.service";
import { getOrCreateUserAccount } from "./stellar.service";
import { getUsdcAsset, transferUsdcFromWallet } from "./usdc.service";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { logSafeError } from "./whatsapp.service";

function horizon(): Horizon.Server {
  return new Horizon.Server(
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
  );
}

function passphrase(): string {
  return (
    process.env.STELLAR_NETWORK_PASSPHRASE ??
    (process.env.STELLAR_NETWORK === "public"
      ? Networks.PUBLIC
      : Networks.TESTNET)
  );
}

async function sendToAnchor(
  phone: string,
  destination: string,
  amount: number,
  memo?: string
): Promise<string> {
  if (!memo) {
    const sent = await transferUsdcFromWallet(
      await getOrCreateUserAccount(phone),
      destination,
      amount
    );
    return sent.txHash;
  }

  const user = await getOrCreateUserAccount(phone);
  const source = await horizon().loadAccount(user.publicKey);
  const asset = getUsdcAsset();
  const tx = new TransactionBuilder(source, {
    fee: await getInclusionFee(),
    networkPassphrase: passphrase(),
  })
    .addOperation(
      Operation.payment({
        destination,
        asset,
        amount: amount.toFixed(7),
      })
    )
    .addMemo(Memo.text(memo.slice(0, 28)))
    .setTimeout(60)
    .build();

  await signStellarTransaction(user, tx);
  const result = await horizon().submitTransaction(tx);
  return result.hash;
}

export async function startMercadoPagoWithdraw(
  phone: string,
  amount: number
): Promise<{ url: string; id: string }> {
  const user = await getOrCreateUserAccount(phone);
  await ensureUserRecord(phone, user.publicKey);
  const jwt = await getSep10Jwt(phone);
  const started = await startWithdraw(user.publicKey, jwt, amount);
  await createTransaction({
    phone,
    type: "withdraw_sep24",
    amountUsdc: String(amount),
    status: "pending",
    sep24TransactionId: started.id,
  });
  void watchSep24Transaction(phone, jwt, started.id, amount);
  return started;
}

async function watchSep24Transaction(
  phone: string,
  jwt: string,
  transactionId: string,
  amount: number
): Promise<void> {
  let sentOnChain = false;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    try {
      const tx = await pollTransactionStatus(jwt, transactionId);
      if (
        !sentOnChain &&
        tx.status === "pending_user_transfer_start" &&
        tx.withdraw_anchor_account
      ) {
        const hash = await sendToAnchor(
          phone,
          tx.withdraw_anchor_account,
          Number(tx.amount_in ?? amount),
          tx.withdraw_memo
        );
        sentOnChain = true;
        await updateTransactionStatus(transactionId, tx.status, hash);
        continue;
      }

      if (tx.status === "completed") {
        await updateTransactionStatus(transactionId, "completed");
        await sendWhatsAppMessage(phone, "✅ Tu retiro llegó a Mercado Pago.");
        return;
      }

      if (tx.status === "error" || tx.status === "expired") {
        await updateTransactionStatus(transactionId, tx.status);
        await sendWhatsAppMessage(
          phone,
          "El retiro a Mercado Pago no se pudo completar. Probá de nuevo en un rato."
        );
        return;
      }
    } catch (error) {
      logSafeError("SEP-24 polling", error);
    }
  }
}
