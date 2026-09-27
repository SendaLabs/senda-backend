import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSavingsReply,
  projectSavings,
  suggestSavingsSlice,
} from "./savings-offer";

test("un cobro chico no se parte", () => {
  assert.equal(suggestSavingsSlice(3), null);
  assert.equal(suggestSavingsSlice(2), null);
  assert.equal(suggestSavingsSlice(0), null);
});

test("de un cobro se aparta una parte y queda saldo para usar", () => {
  assert.equal(suggestSavingsSlice(4), 2);
  assert.equal(suggestSavingsSlice(20), 2);
  assert.equal(suggestSavingsSlice(50), 5);
  assert.equal(suggestSavingsSlice(100), 10);
  const slice = suggestSavingsSlice(25);
  assert.equal(slice, 2.5);
  assert.ok(slice !== null && 25 - slice >= 2);
});

test("la proyección a 5 años usa 4% y no redondea de más", () => {
  assert.equal(projectSavings(2), 2.43);
  assert.equal(projectSavings(0), 0);
});

test("sí aparta, no lo deja en el saldo, y un número cambia el monto", () => {
  assert.equal(parseSavingsReply("sí"), "accept");
  assert.equal(parseSavingsReply("dale"), "accept");
  assert.equal(parseSavingsReply("no"), "decline");
  assert.equal(parseSavingsReply("dejalo"), "decline");
  assert.equal(parseSavingsReply("después"), "decline");
  assert.deepEqual(parseSavingsReply("5"), { amount: 5 });
  assert.deepEqual(parseSavingsReply("apartá 3"), { amount: 3 });
  assert.equal(parseSavingsReply("cuánto tengo"), "other");
});
