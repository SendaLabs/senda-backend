import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expectedMetaSignature,
  resolveWebhookChallenge,
  verifyMetaSignature,
} from "./webhook-security.service";

test("acepta una firma HMAC-SHA256 válida de Meta", () => {
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "test-app-secret";
  const header = expectedMetaSignature(rawBody, secret);
  assert.equal(verifyMetaSignature(rawBody, header, secret), true);
});

test("rechaza firma inválida, ausente o body vacío", () => {
  const rawBody = Buffer.from('{"entry":[]}');
  const secret = "test-app-secret";
  const valid = expectedMetaSignature(rawBody, secret);

  assert.equal(verifyMetaSignature(rawBody, "sha256=deadbeef", secret), false);
  assert.equal(verifyMetaSignature(rawBody, undefined, secret), false);
  assert.equal(verifyMetaSignature(undefined, valid, secret), false);
  assert.equal(verifyMetaSignature(rawBody, valid, ""), false);
});

test("GET de verificación exige VERIFY_TOKEN y no acepta undefined===undefined", () => {
  const previous = process.env.VERIFY_TOKEN;
  delete process.env.VERIFY_TOKEN;

  assert.equal(
    resolveWebhookChallenge({
      mode: "subscribe",
      token: undefined,
      challenge: "123",
    }),
    null
  );

  process.env.VERIFY_TOKEN = "senda-verify-token";
  assert.equal(
    resolveWebhookChallenge({
      mode: "subscribe",
      token: "senda-verify-token",
      challenge: "123",
    }),
    "123"
  );
  assert.equal(
    resolveWebhookChallenge({
      mode: "subscribe",
      token: "otro",
      challenge: "123",
    }),
    null
  );

  if (previous === undefined) {
    delete process.env.VERIFY_TOKEN;
  } else {
    process.env.VERIFY_TOKEN = previous;
  }
});
