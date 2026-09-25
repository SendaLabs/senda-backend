import assert from "node:assert/strict";
import { test } from "node:test";
import {
  routeOfframpProvider,
  Sep24AnchorAdapter,
  listOfframpProviders,
} from "./provider-router";
import { canCompleteSep24Payout, sep24StatusCopy } from "../services/sep24-withdraw.service";

test("el router de hoy solo tiene el ancla SEP-24 para Mercado Pago", () => {
  const provider = routeOfframpProvider("mercado_pago_ars");
  assert.equal(provider.id, "sep24_anchor");
  assert.ok(provider instanceof Sep24AnchorAdapter);
  assert.equal(listOfframpProviders().length, 1);
});

test("el payout no se completa si falta ancla o Horizon", () => {
  assert.equal(canCompleteSep24Payout({}), false);
  assert.equal(canCompleteSep24Payout({ horizonConfirmed: true }), false);
  assert.equal(canCompleteSep24Payout({ anchorConfirmed: true }), false);
  assert.equal(
    canCompleteSep24Payout({ horizonConfirmed: true, anchorConfirmed: true }),
    true
  );
});

test("los avisos de retiro se entienden sin saber qué es un ancla", () => {
  assert.match(sep24StatusCopy("pending") ?? "", /Mercado Pago/);
  assert.match(sep24StatusCopy("completed") ?? "", /confirmado/);
  assert.match(sep24StatusCopy("error") ?? "", /saldo sigue en Senda/);
});
