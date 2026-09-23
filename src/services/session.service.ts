import type { OfframpPartnerId } from "./offramp.store";

export const ConversationStep = {
  AWAITING_MENU_OPTION: "AWAITING_MENU_OPTION",
  AWAITING_USD_AMOUNT: "AWAITING_USD_AMOUNT",
  AWAITING_WITHDRAW_AMOUNT: "AWAITING_WITHDRAW_AMOUNT",
  AWAITING_WITHDRAW_PARTNER: "AWAITING_WITHDRAW_PARTNER",
  AWAITING_MP_AMOUNT: "AWAITING_MP_AMOUNT",
  AWAITING_YIELD_SUPPLY_AMOUNT: "AWAITING_YIELD_SUPPLY_AMOUNT",
  AWAITING_YIELD_WITHDRAW_AMOUNT: "AWAITING_YIELD_WITHDRAW_AMOUNT",
} as const;

export type ConversationStep =
  (typeof ConversationStep)[keyof typeof ConversationStep];

export interface ConversationSession {
  step: ConversationStep;
  name: string;
  pendingAmount?: number;
  pendingPartner?: OfframpPartnerId;
}

const sessions = new Map<string, ConversationSession>();

export function getSession(phone: string): ConversationSession | undefined {
  return sessions.get(phone);
}

export function setSession(
  phone: string,
  session: ConversationSession
): ConversationSession {
  sessions.set(phone, session);
  console.log(`Sesión ${phone}: paso ${session.step}`);
  return session;
}

export function parseMenuOption(text: string): "1" | "2" | null {
  const digits = text.trim().replace(/[^\d]/g, "");
  if (digits === "1") return "1";
  if (digits === "2") return "2";
  return null;
}

export function isMenuRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized === "menu" ||
    normalized === "menú" ||
    normalized === "0" ||
    normalized === "hola"
  );
}
