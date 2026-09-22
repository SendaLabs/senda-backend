import fs from "fs";
import path from "path";

export type OfframpPartnerId = "moneygram" | "comercio" | "western_union";

export type OfframpOrderStatus = "pending_pickup" | "completed" | "failed";

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

const ORDERS_PATH = path.join(process.cwd(), "data", "offramp-orders.json");

function readStore(): OfframpOrder[] {
  try {
    const raw = fs.readFileSync(ORDERS_PATH, "utf8");
    return JSON.parse(raw) as OfframpOrder[];
  } catch {
    return [];
  }
}

function writeStore(orders: OfframpOrder[]): void {
  fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function saveOfframpOrder(order: OfframpOrder): OfframpOrder {
  const orders = readStore();
  orders.unshift(order);
  writeStore(orders);
  return order;
}

export function listOfframpOrders(phone: string): OfframpOrder[] {
  return readStore().filter((order) => order.phone === phone);
}

export function getLatestPendingOrder(phone: string): OfframpOrder | undefined {
  return listOfframpOrders(phone).find(
    (order) => order.status === "pending_pickup"
  );
}
