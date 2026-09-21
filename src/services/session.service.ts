export const ConversationStep = {
  AWAITING_MENU_OPTION: "AWAITING_MENU_OPTION",
  RECEIVE_OR_WITHDRAW: "RECEIVE_OR_WITHDRAW",
  CHECK_TRANSFER: "CHECK_TRANSFER",
} as const;

export type ConversationStep =
  (typeof ConversationStep)[keyof typeof ConversationStep];

export interface ConversationSession {
  step: ConversationStep;
  name: string;
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
