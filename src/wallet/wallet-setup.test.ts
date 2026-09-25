import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSetupInvite,
  buildSetupReadyMessage,
  maybeInviteWalletSetup,
} from "./wallet-setup";
import {
  SENDA_MAX_USDC_PER_DAY,
  SENDA_MAX_USDC_PER_TRANSACTION,
} from "./spend-policy";

test("el invite de alta manda el link corto y pide el mismo WhatsApp", () => {
  const text = buildSetupInvite("Ana", "http://localhost:3000/s/abc");
  assert.match(text, /http:\/\/localhost:3000\/s\/abc/);
  assert.match(text, /email/);
  assert.match(text, /Ana/);
  assert.match(text, /ya podés volver/);
  assert.match(text, /creada con éxito/);
});

test("el aviso post-alta confirma y agradece", () => {
  const text = buildSetupReadyMessage();
  assert.match(text, /creada con éxito/);
  assert.match(text, /Gracias/);
  assert.match(text, /¿En qué te puedo ayudar\?/);
});

test("la policy de gasto por defecto queda fijada en constantes", () => {
  assert.equal(SENDA_MAX_USDC_PER_TRANSACTION, 500);
  assert.equal(SENDA_MAX_USDC_PER_DAY, 2000);
});

test("sin alta web lista no se manda el link de setup", async () => {
  const previous = process.env.USE_PRIVY_WALLETS;
  process.env.USE_PRIVY_WALLETS = "false";
  assert.equal(await maybeInviteWalletSetup("5491100000099", "Ana"), null);
  if (previous === undefined) delete process.env.USE_PRIVY_WALLETS;
  else process.env.USE_PRIVY_WALLETS = previous;
});
