import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent, extractUsdAmount } from "./intent.service";

test("el guion del sábado entra a cada flujo", () => {
  assert.equal(classifyIntent("hola").type, "menu");
  assert.deepEqual(classifyIntent("1"), { type: "option", option: "1" });
  assert.deepEqual(classifyIntent("2"), { type: "option", option: "2" });
  assert.deepEqual(classifyIntent("3"), { type: "option", option: "3" });
  assert.deepEqual(classifyIntent("4"), { type: "option", option: "4" });
  assert.deepEqual(classifyIntent("5"), { type: "option", option: "5" });
  assert.deepEqual(classifyIntent("6"), { type: "option", option: "6" });

  assert.deepEqual(classifyIntent("mandar 5"), { type: "send", amount: 5 });
  assert.equal(classifyIntent("cuanto tengo").type, "balance");
  assert.deepEqual(classifyIntent("retirar 2 en MoneyGram"), {
    type: "withdraw",
    amount: 2,
    partner: "moneygram",
  });
  assert.deepEqual(classifyIntent("retirar 2 a Mercado Pago"), {
    type: "withdraw_mp",
    amount: 2,
  });
  assert.deepEqual(classifyIntent("poner 1 a rendir"), {
    type: "yield_supply",
    amount: 1,
  });
  assert.equal(classifyIntent("cuanto tengo rindiendo").type, "yield_position");
  assert.deepEqual(classifyIntent("sacar 1 de rendir"), {
    type: "yield_withdraw",
    amount: 1,
  });
  assert.deepEqual(classifyIntent("generame un link de cobro"), {
    type: "cobro",
    amount: null,
  });
  assert.equal(
    classifyIntent(
      "web+stellar:pay?destination=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5&amount=10"
    ).type,
    "sep7_pay"
  );
});

test("un monto suelto no se acredita como envío", () => {
  assert.equal(classifyIntent("5").type, "option");
  assert.equal(classifyIntent("20").type, "unknown");
  assert.equal(extractUsdAmount("5"), 5);
});
