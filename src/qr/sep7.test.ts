import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  cobroChatCaption,
  cobroWalletMsg,
  looksLikeLabReceiveCopy,
} from "./cobro-copy";
import { extractCobroToken } from "./cobro.store";
import {
  buildSendaCobroUri,
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

test("el texto del cobro nunca muestra la frase de laboratorio ni la clave G", () => {
  const caption = cobroChatCaption(15);
  const msg = cobroWalletMsg(15);
  assert.equal(looksLikeLabReceiveCopy(caption), false);
  assert.equal(looksLikeLabReceiveCopy(msg), false);
  assert.equal(/G[A-Z2-7]{55}/.test(caption), false);
  assert.equal(/web\+stellar/i.test(caption), false);
  assert.match(msg, /Senda/);
});

test("el URI de cobro lleva un mensaje en español, no el default en inglés", () => {
  const destination = Keypair.random().publicKey();
  const uri = buildSendaCobroUri(destination, 15);
  const parsed = parseSep7PayUri(uri);
  assert.equal(parsed?.msg, "Te piden 15 dolares por Senda");
  assert.equal(looksLikeLabReceiveCopy(uri), false);
});

test("reconoce el enlace corto de cobro", () => {
  assert.equal(
    extractCobroToken("https://senda-backend.onrender.com/c/aabbccddeeff00112233445566778899"),
    "aabbccddeeff00112233445566778899"
  );
});

test("el QR es un PNG", async () => {
  const png = await renderSep7QrPng("web+stellar:pay?destination=GTEST");
  assert.equal(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
});
