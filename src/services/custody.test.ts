import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { after, before, test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-custody-"));
process.env.SENDA_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
process.env.CUSTODY_MASTER_SECRET = "custody-master-secret-for-tests-32ch";
process.env.FILE_VAULT_SECRET = "file-vault-secret-for-tests-32chars";
process.env.STELLAR_SECRET_KEY = Keypair.random().secret();

const { getCustodyMasterSecret, assertRuntimeSecrets } = require("./custody-secrets.service") as typeof import("./custody-secrets.service");
const { accountFromDerivedPhone } = require("./derivation.service") as typeof import("./derivation.service");
const { resolveCustodialAccount } = require("./custody.service") as typeof import("./custody.service");
const { getWalletByPhone, walletStoreContainsPlainSeeds } = require("./wallet.store") as typeof import("./wallet.store");
const { closeDb } = require("../db/sqlite") as typeof import("../db/sqlite");
const { redactSecrets } = require("./file-vault.service") as typeof import("./file-vault.service");

after(() => {
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("no deriva con STELLAR_SECRET_KEY si falta CUSTODY_MASTER_SECRET", () => {
  const previous = process.env.CUSTODY_MASTER_SECRET;
  delete process.env.CUSTODY_MASTER_SECRET;
  assert.throws(() => getCustodyMasterSecret(), /Falta CUSTODY_MASTER_SECRET/);
  process.env.CUSTODY_MASTER_SECRET = previous;
});

test("exige secretos distintos en el boot", () => {
  assert.doesNotThrow(() => assertRuntimeSecrets());
  const previous = process.env.FILE_VAULT_SECRET;
  process.env.FILE_VAULT_SECRET = process.env.CUSTODY_MASTER_SECRET;
  assert.throws(() => assertRuntimeSecrets(), /distinto/);
  process.env.FILE_VAULT_SECRET = previous;
});

test("persiste la wallet derivada sin seed S... y no cambia la dirección al rotar", async () => {
  const phone = "5491111111111";
  const first = await resolveCustodialAccount(phone);
  const stored = await getWalletByPhone(phone);

  assert.equal(first.account.publicKey, accountFromDerivedPhone(phone).publicKey);
  assert.equal(walletStoreContainsPlainSeeds(), false);
  assert.equal(stored?.publicKey.startsWith("G"), true);
  assert.equal(stored?.secretKey, "");

  process.env.CUSTODY_MASTER_SECRET = "rotated-custody-master-secret-32chars!!";
  await assert.rejects(
    () => resolveCustodialAccount(phone),
    /no coincide con la cuenta persistida/
  );
  process.env.CUSTODY_MASTER_SECRET = "custody-master-secret-for-tests-32ch";
});

test("redacta seeds Stellar en logs", () => {
  const seed = Keypair.random().secret();
  const redacted = redactSecrets(`secretKey=${seed} cayó`);
  assert.doesNotMatch(redacted, /S[A-Z2-7]{55}/);
  assert.match(redacted, /\[redacted-seed\]/);
});
