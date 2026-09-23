import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { after, before, test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-custody-"));
process.env.SENDA_DATA_DIR = dataDir;
process.env.CUSTODY_MASTER_SECRET = "custody-master-secret-for-tests-32ch";
process.env.FILE_VAULT_SECRET = "file-vault-secret-for-tests-32chars";
process.env.STELLAR_SECRET_KEY = Keypair.random().secret();

const { getCustodyMasterSecret, assertRuntimeSecrets } = require("./custody-secrets.service") as typeof import("./custody-secrets.service");
const { accountFromDerivedPhone } = require("./derivation.service") as typeof import("./derivation.service");
const { resolveCustodialAccount } = require("./custody.service") as typeof import("./custody.service");
const { saveOfframpOrder, listOfframpOrders } = require("./offramp.store") as typeof import("./offramp.store");
const { walletStoreContainsPlainSeeds } = require("./wallet.store") as typeof import("./wallet.store");
const { redactSecrets } = require("./file-vault.service") as typeof import("./file-vault.service");

after(() => {
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
  const walletsPath = path.join(dataDir, "wallets.json");
  const raw = fs.readFileSync(walletsPath, "utf8");

  assert.equal(first.account.publicKey, accountFromDerivedPhone(phone).publicKey);
  assert.equal(walletStoreContainsPlainSeeds(walletsPath), false);
  assert.match(raw, /"publicKey": "G/);
  assert.doesNotMatch(raw, /"secretKey": "S/);

  process.env.CUSTODY_MASTER_SECRET = "rotated-custody-master-secret-32chars!!";
  await assert.rejects(
    () => resolveCustodialAccount(phone),
    /no coincide con la cuenta persistida/
  );
  process.env.CUSTODY_MASTER_SECRET = "custody-master-secret-for-tests-32ch";
});

test("dos retiros concurrentes no se pisan", async () => {
  const phone = "5491144444444";
  await Promise.all([
    saveOfframpOrder({
      id: "ord-a",
      phone,
      amountUsdc: "10",
      partner: "moneygram",
      partnerLabel: "MoneyGram",
      pickupCode: "AAA111",
      locationHint: "cerca",
      expiresAt: new Date().toISOString(),
      status: "pending_pickup",
      txHash: "hash-a",
      createdAt: new Date().toISOString(),
    }),
    saveOfframpOrder({
      id: "ord-b",
      phone,
      amountUsdc: "12",
      partner: "comercio",
      partnerLabel: "comercio",
      pickupCode: "BBB222",
      locationHint: "cerca",
      expiresAt: new Date().toISOString(),
      status: "pending_pickup",
      txHash: "hash-b",
      createdAt: new Date().toISOString(),
    }),
  ]);

  const orders = listOfframpOrders(phone);
  assert.equal(orders.length, 2);
  assert.deepEqual(new Set(orders.map((order) => order.id)), new Set(["ord-a", "ord-b"]));
  assert.deepEqual(new Set(orders.map((order) => order.pickupCode)), new Set(["AAA111", "BBB222"]));

  const disk = fs.readFileSync(path.join(dataDir, "offramp-orders.json"), "utf8");
  assert.match(disk, /enc:v1:/);
  assert.doesNotMatch(disk, /AAA111|BBB222/);
});

test("redacta seeds Stellar en logs", () => {
  const seed = Keypair.random().secret();
  const redacted = redactSecrets(`secretKey=${seed} cayó`);
  assert.doesNotMatch(redacted, /S[A-Z2-7]{55}/);
  assert.match(redacted, /\[redacted-seed\]/);
});
