import {
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  createTransaction,
  ensureUserRecord,
  listPendingSep24,
  updateTransactionStatus,
} from "../db/users.repository";
import { decryptString, encryptString } from "./file-vault.service";
import { getSep10Jwt } from "../sep/sep10";
import { pollTransactionStatus, startWithdraw } from "../sep/sep24";
import { getInclusionFee } from "./fees.service";
import { getOrCreateUserAccount } from "./stellar.service";
import {
  fromUsdcStroops,
  getUsdcAsset,
  getUsdcBalance,
  toUsdcStroops,
} from "./usdc.service";
import { signStellarTransaction } from "../wallet/stellar-signer";
import { logSafeError, sendWhatsAppMessage } from "./whatsapp.service";

const AMOUNT_TOLERANCE = 0.01;

export function isStellarAccount(value: string): boolean {
  return /^[GC][A-Z2-7]{55}$/.test(value.trim());
}

export function assertSep24AmountIn(
  requested: number,
  amountIn: string | undefined
): number {
  const incoming = Number(amountIn ?? requested);
  if (!Number.isFinite(incoming) || incoming <= 0) {
    throw new Error("El ancla pidió un monto inválido. No pagamos.");
  }
  const delta = Math.abs(incoming - requested) / requested;
  if (delta > AMOUNT_TOLERANCE) {
    throw new Error("El ancla pidió otro monto. No pagamos.");
  }
  return incoming;
}

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

function addWithdrawMemo(
  builder: TransactionBuilder,
  memo: string | undefined,
  memoType: string | undefined
): TransactionBuilder {
  if (!memo) {
    return builder;
  }
  if (memoType === "id") {
    return builder.addMemo(Memo.id(memo));
  }
  if (memoType === "hash" || memoType === "return") {
    const raw =
      memo.length === 64 ? Buffer.from(memo, "hex") : Buffer.from(memo, "base64");
    return builder.addMemo(Memo.hash(raw));
  }
  return builder.addMemo(Memo.text(memo.slice(0, 28)));
}

async function sendToAnchor(
  phone: string,
  destination: string,
  amount: number,
  memo?: string,
  memoType?: string
): Promise<string> {
  if (!isStellarAccount(destination)) {
    throw new Error("La cuenta del ancla no es válida");
  }

  const user = await getOrCreateUserAccount(phone);
  const source = await horizon().loadAccount(user.publicKey);
  const asset = getUsdcAsset();
  const builder = new TransactionBuilder(source, {
    fee: await getInclusionFee(),
    networkPassphrase: passphrase(),
  }).addOperation(
    Operation.payment({
      destination,
      asset,
      amount: fromUsdcStroops(toUsdcStroops(amount)),
    })
  );
  const tx = addWithdrawMemo(builder, memo, memoType).setTimeout(60).build();
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
  const available = await getUsdcBalance(user.publicKey);
  const needed = toUsdcStroops(amount);
  if (available < needed) {
    throw new Error("No te alcanza el saldo para ese retiro a Mercado Pago");
  }

  const jwt = await getSep10Jwt(phone);
  const started = await startWithdraw(user.publicKey, jwt, amount);
  await createTransaction({
    phone,
    type: "withdraw_sep24",
    amountUsdc: String(amount),
    status: "pending",
    sep24TransactionId: started.id,
    sep24JwtEnc: encryptString(jwt),
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
        const payAmount = assertSep24AmountIn(amount, tx.amount_in);
        const hash = await sendToAnchor(
          phone,
          tx.withdraw_anchor_account,
          payAmount,
          tx.withdraw_memo,
          tx.withdraw_memo_type
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

  await updateTransactionStatus(transactionId, "expired");
  await sendWhatsAppMessage(
    phone,
    "No pude terminar el retiro a Mercado Pago. Si el enlace sigue abierto, abrilo de nuevo o pedime otro."
  ).catch((error) => logSafeError("SEP-24 timeout aviso", error));
}

export async function resumePendingSep24Withdrawals(): Promise<void> {
  const pending = await listPendingSep24();
  for (const row of pending) {
    if (!row.sep24TransactionId) {
      continue;
    }
    try {
      const jwt = row.sep24JwtEnc
        ? decryptString(row.sep24JwtEnc)
        : await getSep10Jwt(row.phone);
      void watchSep24Transaction(
        row.phone,
        jwt,
        row.sep24TransactionId,
        Number(row.amountUsdc)
      );
    } catch (error) {
      logSafeError("SEP-24 resume", error);
      await sendWhatsAppMessage(
        row.phone,
        "No pude retomar tu retiro a Mercado Pago. Pedime uno nuevo cuando quieras."
      ).catch((sendError) => logSafeError("SEP-24 resume aviso", sendError));
    }
  }
}
