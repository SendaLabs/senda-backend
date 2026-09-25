import assert from "node:assert/strict";
import { test } from "node:test";
import { toPrivyHashHex } from "./privy-client";

test("el hash Stellar se manda a Privy como hex 0x (raw_sign EdDSA)", () => {
  const hash = Buffer.from("ab".repeat(32), "hex");
  assert.equal(toPrivyHashHex(hash), `0x${"ab".repeat(32)}`);
});

test("createStellarWallet exige PRIVY_APP_ID y PRIVY_APP_SECRET", async () => {
  const previous = {
    id: process.env.PRIVY_APP_ID,
    secret: process.env.PRIVY_APP_SECRET,
  };
  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;

  const { createStellarWallet } = await import("./privy-client");
  await assert.rejects(
    () => createStellarWallet("whatsapp:54911"),
    /PRIVY_APP_ID|PRIVY_APP_SECRET/
  );

  if (previous.id === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = previous.id;
  if (previous.secret === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = previous.secret;
});
