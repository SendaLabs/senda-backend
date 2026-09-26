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

async function resolveSecret(
  phone: string,
  record: Sep30IdentityRecord
): Promise<CustodialAccount> {
  if (record.source === "derived") {
    const derived = accountFromDerivedPhone(phone);
    if (derived.publicKey !== record.account) {
      throw new Error(
        "CUSTODY_MASTER_SECRET no coincide con la cuenta persistida. No se cambia la dirección en silencio."
      );
    }
    await saveWallet(phone, derived, { persistSecret: false });
    return derived;
  }

  const stored = await getWalletByPhone(phone);
  if (!stored || stored.publicKey !== record.account || !stored.secretKey) {
    throw new Error("No se pudo recuperar la clave de la cuenta legado");
  }
  await saveWallet(phone, stored, { persistSecret: true });
  return stored;
}

export async function registerCustodialAccount(
  phone: string,
  account: CustodialAccount,
  source: Sep30IdentityRecord["source"]
): Promise<Sep30IdentityRecord> {
  await saveWallet(phone, account, {
    persistSecret: source === "legacy",
  });
  return saveIdentityRecord(phone, buildIdentityRecord(phone, account, source));
}

export async function resolveCustodialAccount(phone: string): Promise<{
  account: CustodialAccount;
  identity: Sep30IdentityRecord;
  recovered: boolean;
}> {
  const existingIdentity = await getIdentityRecord(phone);
  if (existingIdentity) {
    const account = await resolveSecret(phone, existingIdentity);
    const identity = (await markIdentityRecovered(phone)) ?? existingIdentity;
    return { account, identity, recovered: true };
  }

  const legacy = await getWalletByPhone(phone);
  if (legacy?.secretKey) {
    const identity = await registerCustodialAccount(phone, legacy, "legacy");
    return { account: legacy, identity, recovered: true };
  }

  const derived = accountFromDerivedPhone(phone);
  const identity = await registerCustodialAccount(phone, derived, "derived");
  return { account: derived, identity, recovered: false };
}

export async function recoverAccountByWhatsApp(phone: string): Promise<{
  account: CustodialAccount;
  identity: Sep30IdentityRecord;
}> {
  const resolved = await resolveCustodialAccount(phone);
  return { account: resolved.account, identity: resolved.identity };
}
