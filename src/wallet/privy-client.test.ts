import assert from "node:assert/strict";
import { test } from "node:test";
import { signStellarHash, toPrivyHashHex } from "./privy-client";

test("el hash Stellar se manda a Privy como hex 0x (raw_sign EdDSA)", () => {
  const hash = Buffer.from("ab".repeat(32), "hex");
  assert.equal(toPrivyHashHex(hash), `0x${"ab".repeat(32)}`);
});

test("sin session signer el server no puede firmar", async () => {
  const previous = process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY;
  delete process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY;
  process.env.PRIVY_APP_ID = process.env.PRIVY_APP_ID || "app_test";
  process.env.PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "secret_test";

  await assert.rejects(
    () => signStellarHash("wallet", Buffer.alloc(32, 2)),
    /PRIVY_SESSION_SIGNER_PRIVATE_KEY/
  );

  if (previous === undefined) delete process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY;
  else process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY = previous;
});
