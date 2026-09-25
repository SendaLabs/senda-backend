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
  findSep24Transaction,
  listPendingSep24,
  patchSep24Transaction,
} from "../db/users.repository";
import { routeOfframpProvider } from "../offramp/provider-router";
import { decryptString, encryptString } from "./file-vault.service";
import { getSep10Jwt } from "../sep/sep10";
import { pollTransactionStatus } from "../sep/sep24";
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

export function canCompleteSep24Payout(row: {
  horizonConfirmed?: boolean;
  anchorConfirmed?: boolean;
}): boolean {
  return row.horizonConfirmed === true && row.anchorConfirmed === true;
}

export function sep24StatusCopy(status: string): string | null {
  switch (status) {
    case "incomplete":
    case "pending":
      return "Estamos armando tu retiro a Mercado Pago. En un momento te mando el enlace o el siguiente paso.";
    case "pending_user_transfer_start":
      return "Ya pasamos tus dólares al ancla. Ahora esperamos que Horizon confirme el envío y que Mercado Pago reciba el aviso.";
    case "pending_anchor":
    case "pending_external":
      return "El ancla ya tiene tus dólares y está acreditándolos en tu Mercado Pago. Te aviso cuando quede confirmado.";
    case "completed":
      return "✅ Listo. El retiro a Mercado Pago está confirmado: lo vimos en el ancla y también en Stellar.";
    case "error":
    case "expired":
      return "El retiro a Mercado Pago no se pudo completar. Tu saldo sigue en Senda. Pedime otro cuando quieras.";
    default:
      return null;
  }
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

export async function confirmHorizonTransaction(
  hash: string
): Promise<boolean> {
  try {
    const tx = await horizon().transactions().transaction(hash).call();
    return tx.successful === true;
  } catch {
    return false;
  }
}

async function notifyStatus(
  phone: string,
  transactionId: string,
  status: string
): Promise<void> {
  const row = await findSep24Transaction(transactionId);
  if (row?.lastNotifiedStatus === status) {
    return;
  }
  const copy = sep24StatusCopy(status);
  await patchSep24Transaction(transactionId, { lastNotifiedStatus: status });
  if (!copy) {
    return;
  }
  await sendWhatsAppMessage(phone, copy).catch((error) =>
    logSafeError("SEP-24 aviso", error)
  );
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

  const provider = routeOfframpProvider("mercado_pago_ars");
  const started = await provider.startWithdraw({ phone, amount });
  if (!started.url || !started.authToken) {
    throw new Error("El proveedor de retiro no devolvió enlace o sesión");
  }

  await createTransaction({
    phone,
    type: "withdraw_sep24",
    amountUsdc: String(amount),
    status: "pending",
    sep24TransactionId: started.id,
    sep24JwtEnc: encryptString(started.authToken),
    providerId: started.providerId,
    horizonConfirmed: false,
    anchorConfirmed: false,
  });
  await notifyStatus(phone, started.id, "pending");
  void watchSep24Transaction(phone, started.authToken, started.id, amount);
  return { url: started.url, id: started.id };
}

async function maybeComplete(
  phone: string,
  transactionId: string
): Promise<boolean> {
  const row = await findSep24Transaction(transactionId);
  if (!row || !canCompleteSep24Payout(row)) {
    return false;
  }
  await patchSep24Transaction(transactionId, { status: "completed" });
  await notifyStatus(phone, transactionId, "completed");
  return true;
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
      await notifyStatus(phone, transactionId, tx.status);

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
        await patchSep24Transaction(transactionId, {
          status: tx.status,
          txHash: hash,
        });

        for (let horizonAttempt = 0; horizonAttempt < 15; horizonAttempt += 1) {
          if (await confirmHorizonTransaction(hash)) {
            await patchSep24Transaction(transactionId, {
              horizonConfirmed: true,
            });
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        continue;
      }

      if (tx.status === "completed") {
        await patchSep24Transaction(transactionId, { anchorConfirmed: true });
        if (await maybeComplete(phone, transactionId)) {
          return;
        }
        continue;
      }

      if (tx.status === "error" || tx.status === "expired") {
        await patchSep24Transaction(transactionId, { status: tx.status });
        await notifyStatus(phone, transactionId, tx.status);
        return;
      }
    } catch (error) {
      logSafeError("SEP-24 polling", error);
    }
  }

  await patchSep24Transaction(transactionId, { status: "expired" });
  await notifyStatus(phone, transactionId, "expired");
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
