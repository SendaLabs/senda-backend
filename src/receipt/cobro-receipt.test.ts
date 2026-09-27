import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCobroReceiptLines,
  buildCobroReceiptPdf,
  operationNumberFromHash,
} from "./cobro-receipt";

test("el número de operación son los últimos 8 del hash, no la G", () => {
  const hash = "abcdef0123456789deadbeefcafebabe11223344";
  assert.equal(operationNumberFromHash(hash), "11223344");
  assert.doesNotMatch(operationNumberFromHash(hash), /^G/);
});

test("el comprobante en español tiene título, monto, De y operación", () => {
  const lines = buildCobroReceiptLines({
    amountLabel: "2",
    payerLabel: "Nico",
    txHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    at: new Date("2026-09-27T15:00:00.000Z"),
  });
  assert.equal(lines[0], "Comprobante Senda");
  assert.match(lines[1], /Recibiste 2 dólares/);
  assert.match(lines.join("\n"), /De: Nico/);
  assert.match(lines.join("\n"), /Número de operación: [A-F0-9]{8}/);
  assert.doesNotMatch(lines.join("\n"), /\bStellar\b/);
  assert.match(lines[lines.length - 1], /stellar\.expert/);
});

test("el PDF se arma en memoria y empieza con %PDF", async () => {
  const pdf = await buildCobroReceiptPdf({
    amountLabel: "2",
    payerLabel: "Ana",
    txHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 200);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
});
