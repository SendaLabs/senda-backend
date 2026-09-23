import path from "path";
import type { OfframpPartnerId } from "./offramp.store";
import { getDataDir } from "./data-dir";
import { hashWhatsAppSender } from "./webhook-security.service";
import { normalizePhoneIdentity } from "./identity.service";
import { mutateJsonFile, readJsonFile } from "./json-store";

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

type SessionStore = Record<string, ConversationSession>;

const sessions = new Map<string, ConversationSession>();

function sessionsPath(): string {
  return path.join(getDataDir(), "sessions.json");
}

function sessionKey(phone: string): string {
  return normalizePhoneIdentity(phone);
}

function hydrateFromDisk(phone: string): ConversationSession | undefined {
  const stored = readJsonFile<SessionStore>(sessionsPath(), {})[sessionKey(phone)];
  if (stored) {
    sessions.set(sessionKey(phone), stored);
  }
  return stored;
}

export function getSession(phone: string): ConversationSession | undefined {
  return sessions.get(sessionKey(phone)) ?? hydrateFromDisk(phone);
}

export function setSession(
  phone: string,
  session: ConversationSession
): ConversationSession {
  const key = sessionKey(phone);
  sessions.set(key, session);
  console.log(`Sesión ${hashWhatsAppSender(phone)}: paso ${session.step}`);
  void mutateJsonFile<SessionStore>(sessionsPath(), {}, (store) => {
    store[key] = session;
    return store;
  });
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
