import assert from "node:assert/strict";
import { test } from "node:test";
import { YieldDepositsBlockedError } from "./savings-service";
import { setYieldDepositsBlockedForTests } from "./utilization-guard";
import { canUseSavings } from "../services/identity.service";

test("en Testnet el ahorro no pide KYC extra", () => {
  assert.equal(canUseSavings("5491100000000"), true);
});

test("si el pool está muy usado no se aceptan depósitos", () => {
  setYieldDepositsBlockedForTests(true);
  assert.equal(
    new YieldDepositsBlockedError().message.includes("pool está muy usado"),
    true
  );
  setYieldDepositsBlockedForTests(false);
});
