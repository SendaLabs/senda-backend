import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPrivyCredentials, usePrivyWallets } from "./flags";

test("Privy se activa si hay credenciales, salvo USE_PRIVY_WALLETS=false", () => {
  const previous = {
    id: process.env.PRIVY_APP_ID,
    secret: process.env.PRIVY_APP_SECRET,
    flag: process.env.USE_PRIVY_WALLETS,
  };

  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.USE_PRIVY_WALLETS;
  assert.equal(hasPrivyCredentials(), false);
  assert.equal(usePrivyWallets(), false);

  process.env.PRIVY_APP_ID = "app_test";
  process.env.PRIVY_APP_SECRET = "secret_test";
  assert.equal(hasPrivyCredentials(), true);
  assert.equal(usePrivyWallets(), true);

  process.env.USE_PRIVY_WALLETS = "false";
  assert.equal(usePrivyWallets(), false);

  process.env.USE_PRIVY_WALLETS = "true";
  delete process.env.PRIVY_APP_SECRET;
  assert.equal(hasPrivyCredentials(), false);
  assert.equal(usePrivyWallets(), true);

  if (previous.id === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = previous.id;
  if (previous.secret === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = previous.secret;
  if (previous.flag === undefined) delete process.env.USE_PRIVY_WALLETS;
  else process.env.USE_PRIVY_WALLETS = previous.flag;
});
