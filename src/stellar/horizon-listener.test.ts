import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ingestTreasuryPayment,
  isUsdcCreditToTreasury,
  nextHorizonBackoffMs,
  resetHorizonListenerForTests,
  waitForTreasuryCredit,
} from "./horizon-listener";

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

test("el backoff de Horizon crece en potencia de 2 y no pasa el tope", () => {
  const first = nextHorizonBackoffMs(0, 1000, 60_000);
  const third = nextHorizonBackoffMs(3, 1000, 60_000);
  const huge = nextHorizonBackoffMs(20, 1000, 60_000);
  assert.ok(first >= 1000 && first < 2000);
  assert.ok(third >= 8000 && third < 10_000);
  assert.ok(huge <= 60_000);
});

test("solo acredita USDC clásico que llega a tesorería", () => {
  const treasury = "GTESTTREASURYACCOUNT00000000000000000000000000000000";
  assert.equal(
    isUsdcCreditToTreasury(
      {
        type: "payment",
        to: treasury,
        from: "GFROM",
        asset_code: "USDC",
        asset_issuer: USDC_ISSUER,
        amount: "10",
      },
      treasury
    ),
    true
  );
  assert.equal(
    isUsdcCreditToTreasury(
      {
        type: "payment",
        to: treasury,
        asset_type: "native",
        amount: "10",
      },
      treasury
    ),
    false
  );
});

test("un depósito no se confirma hasta el evento del listener", async () => {
  resetHorizonListenerForTests();
  const pending = waitForTreasuryCredit({
    from: "GFROM",
    amountStroops: 10_0000000n,
    timeoutMs: 500,
  });

  ingestTreasuryPayment({
    id: "op-1",
    hash: "hash-1",
    from: "GFROM",
    to: "GTREASURY",
    amountStroops: 10_0000000n,
    pagingToken: "1",
  });

  const event = await pending;
  assert.equal(event.hash, "hash-1");
});

test("sin evento Horizon el waiter falla y no confirma en optimista", async () => {
  resetHorizonListenerForTests();
  await assert.rejects(
    () =>
      waitForTreasuryCredit({
        from: "GFROM",
        amountStroops: 1n,
        timeoutMs: 20,
      }),
    /no confirmó el depósito/
  );
});
