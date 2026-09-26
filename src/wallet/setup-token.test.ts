import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-setup-"));
process.env.SENDA_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;

const {
  consumeSetupToken,
  issueSetupToken,
  maskPhone,
  peekSetupToken,
  setupShortUrl,
} = require("./setup-token.store") as typeof import("./setup-token.store");

test("el token de alta se reusa si sigue vigente y se gasta una sola vez", async () => {
  const first = await issueSetupToken("5491100000001");
  const second = await issueSetupToken("5491100000001");
  assert.equal(first.token, second.token);
  assert.ok(await peekSetupToken(first.token));

  const consumed = await consumeSetupToken(first.token);
  assert.equal(consumed.phone, "5491100000001");
  assert.equal(await peekSetupToken(first.token), null);
  await assert.rejects(() => consumeSetupToken(first.token), /ya no sirve/);
});

test("el link de WhatsApp va al sitio de alta, no al API", () => {
  const previous = {
    web: process.env.WEB_SETUP_PUBLIC_URL,
    public: process.env.PUBLIC_BASE_URL,
    render: process.env.RENDER_EXTERNAL_URL,
  };
  process.env.WEB_SETUP_PUBLIC_URL = "https://senda-backend1.onrender.com";
  process.env.PUBLIC_BASE_URL = "https://senda-backend-2r5k.onrender.com";
  process.env.RENDER_EXTERNAL_URL = "https://senda-backend-2r5k.onrender.com";
  assert.equal(
    setupShortUrl("abc123"),
    "https://senda-backend1.onrender.com/s/abc123"
  );
  if (previous.web === undefined) delete process.env.WEB_SETUP_PUBLIC_URL;
  else process.env.WEB_SETUP_PUBLIC_URL = previous.web;
  if (previous.public === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = previous.public;
  if (previous.render === undefined) delete process.env.RENDER_EXTERNAL_URL;
  else process.env.RENDER_EXTERNAL_URL = previous.render;
});

test("el teléfono se enmascara para la web", () => {
  assert.equal(maskPhone("5491122334455"), "+5491 **** 455");
});
