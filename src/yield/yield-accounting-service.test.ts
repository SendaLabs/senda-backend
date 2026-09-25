import assert from "node:assert/strict";
import { test } from "node:test";
import { allocatePooledYield } from "./yield-accounting-service";
import { getMaxBlendUtilization } from "./utilization-guard";

test("el yield pooled se reparte según el share de cada usuario", () => {
  const allocated = allocatePooledYield(
    [
      {
        phone: "1",
        sharesStroops: "100000000",
        bUsdcBalance: "100000000",
        accruedYieldUsdc: "0",
        lastSyncedValueUsdc: "10",
        updatedAt: "",
      },
      {
        phone: "2",
        sharesStroops: "100000000",
        bUsdcBalance: "100000000",
        accruedYieldUsdc: "0",
        lastSyncedValueUsdc: "10",
        updatedAt: "",
      },
    ],
    220_0000000n
  );

  assert.equal(allocated[0]?.valueStroops, 110_0000000n);
  assert.equal(allocated[1]?.valueStroops, 110_0000000n);
});

test("si no hay shares, nadie se lleva el yield", () => {
  const allocated = allocatePooledYield([], 50_0000000n);
  assert.equal(allocated.length, 0);
});

test("el umbral de utilización por defecto es 85%", () => {
  delete process.env.BLEND_MAX_UTILIZATION;
  assert.equal(getMaxBlendUtilization(), 0.85);
  process.env.BLEND_MAX_UTILIZATION = "0.7";
  assert.equal(getMaxBlendUtilization(), 0.7);
  delete process.env.BLEND_MAX_UTILIZATION;
});
