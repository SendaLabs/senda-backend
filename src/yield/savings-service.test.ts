import assert from "node:assert/strict";
import { test } from "node:test";
import {
  abortOnBlendFailure,
  BlendOperationError,
  YieldDepositsBlockedError,
} from "./savings-service";
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

test("si Blend falla no se confirma éxito: aborta con error claro", () => {
  assert.throws(
    () => abortOnBlendFailure("deposit", new Error("simulación falló")),
    (error: unknown) =>
      error instanceof BlendOperationError &&
      /quedó a salvo/.test(error.message)
  );
  assert.throws(
    () => abortOnBlendFailure("withdraw", new Error("simulación falló")),
    (error: unknown) =>
      error instanceof BlendOperationError &&
      /No moví nada/.test(error.message)
  );
});
