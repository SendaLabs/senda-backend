import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { getTreasuryPublicKey, withTreasurySequence } from "./treasury";

test("la tesorería usa STELLAR_TREASURY_SECRET_KEY si está", () => {
  const treasury = Keypair.random();
  const ops = Keypair.random();
  const previousTreasury = process.env.STELLAR_TREASURY_SECRET_KEY;
  const previousOps = process.env.STELLAR_SECRET_KEY;
  process.env.STELLAR_TREASURY_SECRET_KEY = treasury.secret();
  process.env.STELLAR_SECRET_KEY = ops.secret();
  assert.equal(getTreasuryPublicKey(), treasury.publicKey());
  if (previousTreasury === undefined) delete process.env.STELLAR_TREASURY_SECRET_KEY;
  else process.env.STELLAR_TREASURY_SECRET_KEY = previousTreasury;
  if (previousOps === undefined) delete process.env.STELLAR_SECRET_KEY;
  else process.env.STELLAR_SECRET_KEY = previousOps;
});

test("withTreasurySequence serializa llamadas para no chocar sequence", async () => {
  const order: number[] = [];
  await Promise.all([
    withTreasurySequence(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(1);
    }),
    withTreasurySequence(async () => {
      order.push(2);
    }),
  ]);
  assert.deepEqual(order, [1, 2]);
});
