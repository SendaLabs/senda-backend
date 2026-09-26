import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { after, test } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "senda-guard-"));
process.env.SENDA_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;

const {
  beginCreditClaim,
  finishCreditClaim,
  CreditInFlightError,
  CreditRateLimitError,
} = require("./operation-guard.service") as typeof import("./operation-guard.service");
const { closeDb } = require("../db/sqlite") as typeof import("../db/sqlite");

after(() => {
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("el mismo message.id no acredita dos veces", async () => {
  const first = await beginCreditClaim("msg-1", "5491100000000", 10);
  assert.equal(first.status, "claimed");
  await finishCreditClaim("msg-1", "hash-1");

  const again = await Promise.all([
    beginCreditClaim("msg-1", "5491100000000", 10),
    beginCreditClaim("msg-1", "5491100000000", 10),
  ]);

  assert.deepEqual(
    again.map((item) => item.status),
    ["duplicate", "duplicate"]
  );
  assert.deepEqual(
    again.map((item) => ("txHash" in item ? item.txHash : "")),
    ["hash-1", "hash-1"]
  );
});

test("un claim en vuelo no se duplica", async () => {
  await beginCreditClaim("msg-2", "5491100000001", 8);
  await assert.rejects(
    () => beginCreditClaim("msg-2", "5491100000001", 8),
    (error: unknown) => error instanceof CreditInFlightError
  );
});

test("el tope diario bloquea sin tocar la red", async () => {
  const phone = "5491100000002";
  for (let i = 0; i < 5; i += 1) {
    await beginCreditClaim(`hour-${i}`, phone, 10);
  }
  await assert.rejects(
    () => beginCreditClaim("hour-overflow", phone, 10),
    (error: unknown) => error instanceof CreditRateLimitError
  );
});
