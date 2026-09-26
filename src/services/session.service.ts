import type { Locale } from "../i18n/locale";
import { dbGet, dbRun } from "../db/client";
import type { OfframpPartnerId } from "./offramp.store";
import { hashWhatsAppSender } from "./webhook-security.service";
import { normalizePhoneIdentity } from "./identity.service";

export const ConversationStep = {
  AWAITING_MENU_OPTION: "AWAITING_MENU_OPTION",
  AWAITING_USD_AMOUNT: "AWAITING_USD_AMOUNT",
  AWAITING_WITHDRAW_AMOUNT: "AWAITING_WITHDRAW_AMOUNT",
  AWAITING_WITHDRAW_PARTNER: "AWAITING_WITHDRAW_PARTNER",
  AWAITING_MP_AMOUNT: "AWAITING_MP_AMOUNT",
  AWAITING_YIELD_SUPPLY_AMOUNT: "AWAITING_YIELD_SUPPLY_AMOUNT",
  AWAITING_YIELD_WITHDRAW_AMOUNT: "AWAITING_YIELD_WITHDRAW_AMOUNT",
  AWAITING_COBRO_AMOUNT: "AWAITING_COBRO_AMOUNT",
  AWAITING_SEP7_AMOUNT: "AWAITING_SEP7_AMOUNT",
} as const;

export type ConversationStep =
  (typeof ConversationStep)[keyof typeof ConversationStep];

export interface ConversationSession {
  step: ConversationStep;
  name: string;
  locale?: Locale;
  pendingAmount?: number;
  pendingPartner?: OfframpPartnerId;
  pendingDestination?: string;
}

type SessionRow = {
  phone: string;
  step: string;
  name: string;
  locale: string | null;
  pending_amount: number | null;
  pending_partner: string | null;
  pending_destination: string | null;
};

const sessions = new Map<string, ConversationSession>();

function sessionKey(phone: string): string {
  return normalizePhoneIdentity(phone);
}

function mapSession(row: SessionRow): ConversationSession {
  return {
    step: row.step as ConversationStep,
    name: row.name,
    locale: (row.locale as Locale | null) ?? undefined,
    pendingAmount: row.pending_amount ?? undefined,
    pendingPartner: (row.pending_partner as OfframpPartnerId | null) ?? undefined,
    pendingDestination: row.pending_destination ?? undefined,
  };
}

export async function hydrateSession(
  phone: string
): Promise<ConversationSession | undefined> {
  const cached = sessions.get(sessionKey(phone));
  if (cached) {
    return cached;
  }
  const row = await dbGet<SessionRow>(
    "SELECT * FROM sessions WHERE phone = ?",
    sessionKey(phone)
  );
  if (!row) {
    return undefined;
  }
  const session = mapSession(row);
  sessions.set(sessionKey(phone), session);
  return session;
}

export function getSession(phone: string): ConversationSession | undefined {
  return sessions.get(sessionKey(phone));
}

export function setSession(
  phone: string,
  session: ConversationSession
): ConversationSession {
  const key = sessionKey(phone);
  sessions.set(key, session);
  console.log(`Sesión ${hashWhatsAppSender(phone)}: paso ${session.step}`);
  void dbRun(
    `INSERT INTO sessions (phone, step, name, locale, pending_amount, pending_partner, pending_destination)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET
       step = excluded.step,
       name = excluded.name,
       locale = excluded.locale,
       pending_amount = excluded.pending_amount,
       pending_partner = excluded.pending_partner,
       pending_destination = excluded.pending_destination`,
    key,
    session.step,
    session.name,
    session.locale ?? null,
    session.pendingAmount ?? null,
    session.pendingPartner ?? null,
    session.pendingDestination ?? null
  );
  return session;
}

export function parseMenuOption(
  text: string
): "1" | "2" | "3" | "4" | "5" | "6" | null {
  const digits = text.trim().replace(/[^\d]/g, "");
  if (
    digits === "1" ||
    digits === "2" ||
    digits === "3" ||
    digits === "4" ||
    digits === "5" ||
    digits === "6"
  ) {
    return digits;
  }
  return null;
}

export function isMenuRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "menu" ||
    normalized === "menú" ||
    normalized === "0" ||
    normalized === "hola" ||
    normalized === "hello" ||
    normalized === "hi"
  );
}
