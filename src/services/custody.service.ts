import type { CustodialAccount, Sep30IdentityRecord } from "./account.types";
import {
  accountFromDerivedPhone,
  deriveRecoveryKeypair,
  logicalPasskeyId,
} from "./derivation.service";
import { toSep30Identity } from "./identity.service";
import {
  getIdentityRecord,
  markIdentityRecovered,
  saveIdentityRecord,
} from "./recovery.store";
import { getWalletByPhone, saveWallet } from "./wallet.store";

function buildIdentityRecord(
  phone: string,
  account: CustodialAccount,
  source: Sep30IdentityRecord["source"]
): Sep30IdentityRecord {
  const recovery = deriveRecoveryKeypair(phone);
  return {
    identity: toSep30Identity(phone),
    account: account.publicKey,
    passkeyId: logicalPasskeyId(phone),
    signers: [
      { role: "device", publicKey: account.publicKey },
      { role: "recovery_server", publicKey: recovery.publicKey() },
    ],
    createdAt: new Date().toISOString(),
    source,
  };
}

function resolveSecret(
  phone: string,
  record: Sep30IdentityRecord
): CustodialAccount {
  if (record.source === "derived") {
    const derived = accountFromDerivedPhone(phone);
    if (derived.publicKey !== record.account) {
      throw new Error("La cuenta derivada no coincide con el registro SEP-30");
    }
    saveWallet(phone, derived);
    return derived;
  }

  const stored = getWalletByPhone(phone);
  if (!stored || stored.publicKey !== record.account) {
    throw new Error("No se pudo recuperar la clave de la cuenta legado");
  }
  return stored;
}

export function registerCustodialAccount(
  phone: string,
  account: CustodialAccount,
  source: Sep30IdentityRecord["source"]
): Sep30IdentityRecord {
  saveWallet(phone, account);
  return saveIdentityRecord(phone, buildIdentityRecord(phone, account, source));
}

export function resolveCustodialAccount(phone: string): {
  account: CustodialAccount;
  identity: Sep30IdentityRecord;
  recovered: boolean;
} {
  const existingIdentity = getIdentityRecord(phone);
  if (existingIdentity) {
    const account = resolveSecret(phone, existingIdentity);
    const identity = markIdentityRecovered(phone) ?? existingIdentity;
    return { account, identity, recovered: true };
  }

  const legacy = getWalletByPhone(phone);
  if (legacy) {
    const identity = registerCustodialAccount(phone, legacy, "legacy");
    return { account: legacy, identity, recovered: true };
  }

  const derived = accountFromDerivedPhone(phone);
  const identity = registerCustodialAccount(phone, derived, "derived");
  return { account: derived, identity, recovered: false };
}

export function recoverAccountByWhatsApp(phone: string): {
  account: CustodialAccount;
  identity: Sep30IdentityRecord;
} {
  const resolved = resolveCustodialAccount(phone);
  return { account: resolved.account, identity: resolved.identity };
}
