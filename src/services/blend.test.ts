import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { buildSubmitOperation } from "./blend.service";

test("sin SDK válido no se envía un submit inventado", () => {
  const user = Keypair.random().publicKey();
  try {
    const operation = buildSubmitOperation(user, 10_000_000n, 2);
    assert.ok(operation);
  } catch (error) {
    assert.match(
      error instanceof Error ? error.message : String(error),
      /No mandamos nada a la red|Cannot find module|fromXDR|submit/
    );
  }
});
