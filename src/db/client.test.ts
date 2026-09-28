import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePostgresUrl } from "./client";

test("reescribe el host directo de Supabase al pooler IPv4", () => {
  const previous = process.env.SUPABASE_REGION;
  process.env.SUPABASE_REGION = "sa-east-1";
  const out = normalizePostgresUrl(
    "postgresql://senda_runtime:secret@db.tkuneaualjfwjsqwmfpe.supabase.co:5432/postgres?sslmode=require"
  );
  assert.match(out, /aws-0-sa-east-1\.pooler\.supabase\.com/);
  assert.match(out, /senda_runtime\.tkuneaualjfwjsqwmfpe/);
  assert.doesNotMatch(out, /db\.tkuneaualjfwjsqwmfpe\.supabase\.co/);
  if (previous === undefined) delete process.env.SUPABASE_REGION;
  else process.env.SUPABASE_REGION = previous;
});

test("deja intacta una URI que ya usa el pooler", () => {
  const raw =
    "postgresql://senda_runtime.tkuneaualjfwjsqwmfpe:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
  assert.equal(normalizePostgresUrl(raw), raw);
});

test("normalizePostgresUrl no inventa secretos al reescribir el host", () => {
  const out = normalizePostgresUrl(
    "postgresql://u:p@db.abc123.supabase.co:5432/postgres"
  );
  assert.match(out, /^postgresql:\/\/u\.abc123:p@aws-0-/);
});
