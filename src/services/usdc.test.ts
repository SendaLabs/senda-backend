import assert from "node:assert/strict";
import { test } from "node:test";
import { Networks } from "@stellar/stellar-sdk";
import {
  AmountLimitError,
  SacUnconfirmedError,
  submitUsdcTransferOnce,
  toUsdcStroops,
} from "./usdc.service";
import { assertNetworkConsistency, getNetworkConfig } from "./stellar.service";
import { classifyIntent } from "./intent.service";

test("convierte USDC a stroops sin float sucio", () => {
  assert.equal(toUsdcStroops("10.5"), 105000000n);
  assert.equal(toUsdcStroops("0.0000001"), 1n);
  assert.equal(toUsdcStroops("1.0000000", { allowZero: true }), 10000000n);
  assert.throws(() => toUsdcStroops("1.00000001"), /decimales/);
});

test("no recorta montos en silencio", async () => {
  await assert.rejects(
    () =>
      submitUsdcTransferOnce(
        { publicKey: "GTEST" },
        "GDEST",
        501,
        async () => "should-not-run",
        async () => "horizon-should-not-run"
      ),
    (error: unknown) => error instanceof AmountLimitError
  );
});

test("un poll timeout con hash no dispara un segundo pago Horizon", async () => {
  let horizonCalls = 0;
  let sacCalls = 0;

  await assert.rejects(
    () =>
      submitUsdcTransferOnce(
        { publicKey: "GTEST" },
        "GDEST",
        10,
        async () => {
          sacCalls += 1;
          throw new SacUnconfirmedError("abc123");
        },
        async () => {
          horizonCalls += 1;
          return "horizon-hash";
        },
        async () => false
      ),
    (error: unknown) => error instanceof SacUnconfirmedError
  );

  assert.equal(sacCalls, 1);
  assert.equal(horizonCalls, 0);
});

test("rechaza testnet con passphrase de public", () => {
  const previousNetwork = process.env.STELLAR_NETWORK;
  const previousPass = process.env.STELLAR_NETWORK_PASSPHRASE;
  process.env.STELLAR_NETWORK = "testnet";
  process.env.STELLAR_NETWORK_PASSPHRASE = Networks.PUBLIC;
  assert.throws(() => getNetworkConfig(), /no coincide/);
  process.env.STELLAR_NETWORK = previousNetwork;
  process.env.STELLAR_NETWORK_PASSPHRASE = previousPass;
});

test("un mensaje que solo tiene 20 no es un envío", () => {
  assert.equal(classifyIntent("20").type, "unknown");
  assert.equal(classifyIntent("hola 20").type, "unknown");
  assert.equal(classifyIntent("mandar 20").type, "send");
});

test("testnet no acepta Horizon de public", () => {
  const previousNetwork = process.env.STELLAR_NETWORK;
  const previousHorizon = process.env.STELLAR_HORIZON_URL;
  const previousPass = process.env.STELLAR_NETWORK_PASSPHRASE;
  process.env.STELLAR_NETWORK = "testnet";
  process.env.STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;
  process.env.STELLAR_HORIZON_URL = "https://horizon.stellar.org";
  assert.throws(() => assertNetworkConsistency(), /Horizon de public/);
  process.env.STELLAR_NETWORK = previousNetwork;
  process.env.STELLAR_HORIZON_URL = previousHorizon;
  process.env.STELLAR_NETWORK_PASSPHRASE = previousPass;
});
