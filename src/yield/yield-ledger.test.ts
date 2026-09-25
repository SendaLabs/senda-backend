import assert from "node:assert/strict";
import { test } from "node:test";
import {
  YIELD_WITHDRAW_MEMO,
  isPositiveUsdcAmount,
  netYieldStroops,
} from "./yield-book";

const user = "GUSER";
const treasury = "GTREASURY";

test("un depósito a tesorería queda rindiendo aunque haya un crédito previo", () => {
  const net = netYieldStroops(
    [
      { from: treasury, to: user, amount: "5.0000000", memo: null },
      { from: user, to: treasury, amount: "5.0000000", memo: null },
    ],
    user,
    treasury
  );
  assert.equal(net, 50_000_000n);
});

test("un crédito de tesorería no se resta del pozo", () => {
  const net = netYieldStroops(
    [{ from: treasury, to: user, amount: "5.0000000" }],
    user,
    treasury
  );
  assert.equal(net, 0n);
});

test("un retiro con memo sí baja lo que está rindiendo", () => {
  const net = netYieldStroops(
    [
      { from: user, to: treasury, amount: "10.0000000" },
      {
        from: treasury,
        to: user,
        amount: "4.0000000",
        memo: YIELD_WITHDRAW_MEMO,
      },
    ],
    user,
    treasury
  );
  assert.equal(net, 60_000_000n);
});

test("no queda negativo si el memo de retiro supera el depósito", () => {
  const net = netYieldStroops(
    [
      { from: user, to: treasury, amount: "2.0000000" },
      {
        from: treasury,
        to: user,
        amount: "5.0000000",
        memo: YIELD_WITHDRAW_MEMO,
      },
    ],
    user,
    treasury
  );
  assert.equal(net, 0n);
});

test("detecta montos de USDC mayores a cero", () => {
  assert.equal(isPositiveUsdcAmount("5"), true);
  assert.equal(isPositiveUsdcAmount("0"), false);
  assert.equal(isPositiveUsdcAmount("0.0000000"), false);
});
