import path from "path";
import { getDataDir } from "./data-dir";
import {
  decryptString,
  encryptString,
  isVaultCiphertext,
} from "./file-vault.service";
import { mutateJsonFile, readJsonFile } from "./json-store";

export type OfframpPartnerId = "moneygram" | "comercio" | "western_union";

export type OfframpOrderStatus =
  | "pending_lock"
  | "pending_pickup"
  | "needs_reconcile"
  | "completed"
  | "failed";

export interface OfframpOrder {
  id: string;
  phone: string;
  amountUsdc: string;
  partner: OfframpPartnerId;
  partnerLabel: string;
  pickupCode: string;
  locationHint: string;
  expiresAt: string;
  status: OfframpOrderStatus;
  txHash: string;
  createdAt: string;
}

function ordersPath(): string {
  return path.join(getDataDir(), "offramp-orders.json");
}

function decodeOrder(order: OfframpOrder): OfframpOrder {
  if (!isVaultCiphertext(order.pickupCode)) {
    return order;
  }
  return { ...order, pickupCode: decryptString(order.pickupCode) };
}

function encodeOrder(order: OfframpOrder): OfframpOrder {
  if (isVaultCiphertext(order.pickupCode)) {
    return order;
  }
  return { ...order, pickupCode: encryptString(order.pickupCode) };
}

function readOrders(): OfframpOrder[] {
  return readJsonFile<OfframpOrder[]>(ordersPath(), []).map(decodeOrder);
}

export async function saveOfframpOrder(order: OfframpOrder): Promise<OfframpOrder> {
  await mutateJsonFile<OfframpOrder[]>(ordersPath(), [], (orders) => {
    const without = orders.filter((item) => item.id !== order.id);
    without.unshift(encodeOrder(order));
    return without;
  });
  return decodeOrder(order);
}

export function listOfframpOrders(phone: string): OfframpOrder[] {
  return readOrders().filter((order) => order.phone === phone);
}

export function getLatestPendingOrder(phone: string): OfframpOrder | undefined {
  return listOfframpOrders(phone).find(
    (order) =>
      order.status === "pending_pickup" || order.status === "pending_lock"
  );
}

export function listOrdersNeedingReconcile(): OfframpOrder[] {
  return readOrders().filter(
    (order) =>
      order.status === "pending_lock" || order.status === "needs_reconcile"
  );
}
