import { Horizon } from "@stellar/stellar-sdk";
import { getUsdcAsset, toUsdcStroops } from "../services/usdc.service";
import { logSafeError } from "../services/whatsapp.service";
import { getTreasuryPublicKey } from "./treasury";

export interface TreasuryPaymentEvent {
  id: string;
  hash: string;
  from: string;
  to: string;
  amountStroops: bigint;
  pagingToken: string;
  assetCode?: string;
  assetIssuer?: string;
}

export type PaymentWaiter = {
  from?: string;
  amountStroops?: bigint;
  afterMs?: number;
  resolve: (event: TreasuryPaymentEvent) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
const DEFAULT_WAIT_MS = 90_000;

const seenIds = new Set<string>();
const waiters = new Set<PaymentWaiter>();
const recent: TreasuryPaymentEvent[] = [];

let closeStream: (() => void) | undefined;
let started = false;
let lastCursor = "now";
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

export function nextHorizonBackoffMs(
  attempt: number,
  base = DEFAULT_BACKOFF_MS,
  max = MAX_BACKOFF_MS
): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(250, exp / 4));
  return Math.min(max, exp + jitter);
}

export function isUsdcCreditToTreasury(
  payment: {
    type?: string;
    to?: string;
    from?: string;
    asset_type?: string;
    asset_code?: string;
    asset_issuer?: string;
    amount?: string;
  },
  treasury: string,
  usdc = getUsdcAsset()
): boolean {
  if (payment.to !== treasury) {
    return false;
  }
  if (payment.type && payment.type !== "payment" && payment.type !== "path_payment_strict_send" && payment.type !== "path_payment_strict_receive") {
    return false;
  }
  if (payment.asset_type === "native") {
    return false;
  }
  return (
    payment.asset_code === usdc.code && payment.asset_issuer === usdc.issuer
  );
}

function matchesWaiter(
  waiter: PaymentWaiter,
  event: TreasuryPaymentEvent
): boolean {
  if (waiter.from && waiter.from !== event.from) {
    return false;
  }
  if (
    waiter.amountStroops !== undefined &&
    waiter.amountStroops !== event.amountStroops
  ) {
    return false;
  }
  if (waiter.afterMs && Date.now() < waiter.afterMs) {
    return false;
  }
  return true;
}

export function ingestTreasuryPayment(event: TreasuryPaymentEvent): boolean {
  if (seenIds.has(event.id)) {
    return false;
  }
  seenIds.add(event.id);
  if (seenIds.size > 2000) {
    const first = seenIds.values().next().value;
    if (first) {
      seenIds.delete(first);
    }
  }
  recent.push(event);
  if (recent.length > 200) {
    recent.shift();
  }

  for (const waiter of [...waiters]) {
    if (!matchesWaiter(waiter, event)) {
      continue;
    }
    waiters.delete(waiter);
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }
    waiter.resolve(event);
  }
  return true;
}

export function waitForTreasuryCredit(options: {
  from?: string;
  amountStroops?: bigint;
  timeoutMs?: number;
}): Promise<TreasuryPaymentEvent> {
  const existing = [...recent].reverse().find((event) =>
    matchesWaiter(
      {
        from: options.from,
        amountStroops: options.amountStroops,
        resolve: () => undefined,
        reject: () => undefined,
      },
      event
    )
  );
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const waiter: PaymentWaiter = {
      from: options.from,
      amountStroops: options.amountStroops,
      afterMs: Date.now() - 5_000,
      resolve,
      reject,
    };
    waiter.timer = setTimeout(() => {
      waiters.delete(waiter);
      reject(
        new Error(
          "Horizon no confirmó el depósito en tesorería. No acreditamos a ciegas."
        )
      );
    }, options.timeoutMs ?? DEFAULT_WAIT_MS);
    waiters.add(waiter);
  });
}

function horizon(): Horizon.Server {
  return new Horizon.Server(
    process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
  );
}

function toEvent(
  payment: Horizon.ServerApi.PaymentOperationRecord,
  treasury: string
): TreasuryPaymentEvent | null {
  if (!isUsdcCreditToTreasury(payment, treasury)) {
    return null;
  }
  if (!payment.from || !payment.amount) {
    return null;
  }
  return {
    id: payment.id,
    hash: payment.transaction_hash,
    from: payment.from,
    to: payment.to,
    amountStroops: toUsdcStroops(payment.amount),
    pagingToken: payment.paging_token,
    assetCode: payment.asset_code,
    assetIssuer: payment.asset_issuer,
  };
}

function connect(attempt = 0): void {
  if (!started) {
    return;
  }

  let treasury: string;
  try {
    treasury = getTreasuryPublicKey();
  } catch (error) {
    logSafeError("Horizon listener: tesorería", error);
    scheduleReconnect(attempt);
    return;
  }

  try {
    closeStream?.();
    closeStream = horizon()
      .payments()
      .forAccount(treasury)
      .cursor(lastCursor)
      .stream({
        onmessage: (payment) => {
          const event = toEvent(
            payment as Horizon.ServerApi.PaymentOperationRecord,
            treasury
          );
          if (!event) {
            return;
          }
          lastCursor = event.pagingToken || lastCursor;
          ingestTreasuryPayment(event);
        },
        onerror: (error) => {
          logSafeError("Horizon listener SSE", error);
          scheduleReconnect(attempt + 1);
        },
      });
  } catch (error) {
    logSafeError("Horizon listener connect", error);
    scheduleReconnect(attempt + 1);
  }
}

function scheduleReconnect(attempt: number): void {
  if (!started) {
    return;
  }
  closeStream?.();
  closeStream = undefined;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  const delay = nextHorizonBackoffMs(attempt);
  reconnectTimer = setTimeout(() => connect(attempt), delay);
}

export function startHorizonListener(): void {
  if (started) {
    return;
  }
  started = true;
  connect(0);
}

export function stopHorizonListener(): void {
  started = false;
  closeStream?.();
  closeStream = undefined;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  for (const waiter of waiters) {
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }
    waiter.reject(new Error("Horizon listener detenido"));
  }
  waiters.clear();
}

export function resetHorizonListenerForTests(): void {
  stopHorizonListener();
  seenIds.clear();
  recent.length = 0;
  lastCursor = "now";
}
