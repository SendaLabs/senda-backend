export interface CustodialAccount {
  publicKey: string;
  secretKey: string;
  privyWalletId?: string;
}

export type CustodySource = "derived" | "legacy";

export type RecoverySignerRole = "device" | "recovery_server";

export interface Sep30Identity {
  type: "phone_number";
  authMethod: "whatsapp_passkey";
  value: string;
}

export interface RecoverySigner {
  role: RecoverySignerRole;
  publicKey: string;
}

export interface Sep30IdentityRecord {
  identity: Sep30Identity;
  account: string;
  passkeyId: string;
  signers: RecoverySigner[];
  createdAt: string;
  lastRecoveredAt?: string;
  source: CustodySource;
}
