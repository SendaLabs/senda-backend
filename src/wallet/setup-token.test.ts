import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-setup-"));
process.env.SENDA_DATA_DIR = dataDir;

const {
  consumeSetupToken,
  issueSetupToken,
  maskPhone,
  peekSetupToken,
} = require("./setup-token.store") as typeof import("./setup-token.store");

test("el token de alta se reusa si sigue vigente y se gasta una sola vez", async () => {
  const first = await issueSetupToken("5491100000001");
  const second = await issueSetupToken("5491100000001");
  assert.equal(first.token, second.token);
  assert.ok(peekSetupToken(first.token));

  const consumed = await consumeSetupToken(first.token);
  assert.equal(consumed.phone, "5491100000001");
  assert.equal(peekSetupToken(first.token), null);
  await assert.rejects(() => consumeSetupToken(first.token), /ya no sirve/);
});

test("el teléfono se enmascara para la web", () => {
  assert.equal(maskPhone("5491122334455"), "+5491 **** 455");
});
