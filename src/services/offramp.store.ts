import { getDb } from "../db/sqlite";
import {
  decryptString,
  encryptString,
  isVaultCiphertext,
} from "./file-vault.service";

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

type OrderRow = {
  id: string;
  phone: string;
  amount_usdc: string;
  partner: string;
  partner_label: string;
  pickup_code: string;
  location_hint: string;
  expires_at: string;
  status: string;
  tx_hash: string;
  created_at: string;
};

function decodePickup(code: string): string {
  return isVaultCiphertext(code) ? decryptString(code) : code;
}

function encodePickup(code: string): string {
  return isVaultCiphertext(code) ? code : encryptString(code);
}

function mapOrder(row: OrderRow): OfframpOrder {
  return {
    id: row.id,
    phone: row.phone,
    amountUsdc: row.amount_usdc,
    partner: row.partner as OfframpPartnerId,
    partnerLabel: row.partner_label,
    pickupCode: decodePickup(row.pickup_code),
    locationHint: row.location_hint,
    expiresAt: row.expires_at,
    status: row.status as OfframpOrderStatus,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

export async function saveOfframpOrder(order: OfframpOrder): Promise<OfframpOrder> {
  getDb()
    .prepare(
      `INSERT INTO offramp_orders
       (id, phone, amount_usdc, partner, partner_label, pickup_code, location_hint, expires_at, status, tx_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         phone = excluded.phone,
         amount_usdc = excluded.amount_usdc,
         partner = excluded.partner,
         partner_label = excluded.partner_label,
         pickup_code = excluded.pickup_code,
         location_hint = excluded.location_hint,
         expires_at = excluded.expires_at,
         status = excluded.status,
         tx_hash = excluded.tx_hash`
    )
    .run(
      order.id,
      order.phone,
      order.amountUsdc,
      order.partner,
      order.partnerLabel,
      encodePickup(order.pickupCode),
      order.locationHint,
      order.expiresAt,
      order.status,
      order.txHash,
      order.createdAt
    );
  return { ...order, pickupCode: decodePickup(order.pickupCode) };
}

export function listOfframpOrders(phone: string): OfframpOrder[] {
  const rows = getDb()
    .prepare("SELECT * FROM offramp_orders WHERE phone = ? ORDER BY created_at DESC")
    .all(phone) as OrderRow[];
  return rows.map(mapOrder);
}

export function getLatestPendingOrder(phone: string): OfframpOrder | undefined {
  return listOfframpOrders(phone).find(
    (order) =>
      order.status === "pending_pickup" || order.status === "pending_lock"
  );
}

export function listOrdersNeedingReconcile(): OfframpOrder[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM offramp_orders
       WHERE status = 'pending_lock' OR status = 'needs_reconcile'`
    )
    .all() as OrderRow[];
  return rows.map(mapOrder);
}
