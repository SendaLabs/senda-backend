import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-privy-acc-"));
process.env.SENDA_DATA_DIR = dataDir;

const { upsertPrivyUser } = require("../db/users.repository") as typeof import("../db/users.repository");
const {
  resolvePrivyAccount,
  WalletSetupRequiredError,
} = require("./privy-account") as typeof import("./privy-account");

test("sin wallet vinculada no se crea nada en el server", async () => {
  await assert.rejects(
    () => resolvePrivyAccount("5491199990000"),
    (error: unknown) => error instanceof WalletSetupRequiredError
  );
});

test("resuelve solo una wallet ya asociada al número", async () => {
  await upsertPrivyUser(
    "5491199990001",
    "wallet_abc",
    "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "did:privy:abc"
  );
  const account = await resolvePrivyAccount("5491199990001");
  assert.equal(account.privyWalletId, "wallet_abc");
  assert.equal(account.secretKey, "");
  assert.equal(account.phone, "5491199990001");
});
