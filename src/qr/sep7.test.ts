import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  buildSep7PayUri,
  parseSep7PayUri,
  renderSep7QrPng,
} from "./sep7";

test("arma y parsea un URI SEP-7 de cobro USDC", () => {
  const destination = Keypair.random().publicKey();
  const uri = buildSep7PayUri({
    destination,
    amount: "12.5",
    assetCode: "USDC",
    assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    msg: "Cobro Senda",
  });

  assert.match(uri, /^web\+stellar:pay\?/);
  const parsed = parseSep7PayUri(`Hola, pagame con esto ${uri} gracias`);
  assert.ok(parsed);
  assert.equal(parsed?.destination, destination);
  assert.equal(parsed?.amount, "12.5");
  assert.equal(parsed?.assetCode, "USDC");
});

test("un texto sin URI SEP-7 no se trata como cobro", () => {
  assert.equal(parseSep7PayUri("mandar 10"), null);
});

test("el QR es un PNG", async () => {
  const png = await renderSep7QrPng("web+stellar:pay?destination=GTEST");
  assert.equal(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
});
