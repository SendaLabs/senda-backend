import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSetupInvite } from "./wallet-setup";
import {
  SENDA_MAX_USDC_PER_DAY,
  SENDA_MAX_USDC_PER_TRANSACTION,
} from "./spend-policy";

test("el invite de alta manda el link corto y pide el mismo WhatsApp", () => {
  const text = buildSetupInvite("Ana", "http://localhost:3000/s/abc");
  assert.match(text, /http:\/\/localhost:3000\/s\/abc/);
  assert.match(text, /mismo número de WhatsApp/);
  assert.match(text, /Ana/);
});

test("la policy de gasto por defecto queda fijada en constantes", () => {
  assert.equal(SENDA_MAX_USDC_PER_TRANSACTION, 500);
  assert.equal(SENDA_MAX_USDC_PER_DAY, 2000);
});
