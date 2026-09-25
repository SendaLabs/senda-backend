import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasPrivyCredentials,
  isPrivySelfCustodyReady,
  isUsableWebSetupUrl,
  usePrivyWallets,
} from "./flags";

test("Privy self-custodial exige alta web + session signer, no solo APP_ID", () => {
  const previous = {
    id: process.env.PRIVY_APP_ID,
    secret: process.env.PRIVY_APP_SECRET,
    flag: process.env.USE_PRIVY_WALLETS,
    signerId: process.env.PRIVY_SESSION_SIGNER_ID,
    signerKey: process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY,
    web: process.env.WEB_SETUP_PUBLIC_URL,
    nodeEnv: process.env.NODE_ENV,
  };

  delete process.env.PRIVY_APP_ID;
  delete process.env.PRIVY_APP_SECRET;
  delete process.env.USE_PRIVY_WALLETS;
  delete process.env.PRIVY_SESSION_SIGNER_ID;
  delete process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY;
  delete process.env.WEB_SETUP_PUBLIC_URL;
  process.env.NODE_ENV = "production";

  assert.equal(hasPrivyCredentials(), false);
  assert.equal(usePrivyWallets(), false);

  process.env.PRIVY_APP_ID = "app_test";
  process.env.PRIVY_APP_SECRET = "secret_test";
  assert.equal(hasPrivyCredentials(), true);
  assert.equal(isPrivySelfCustodyReady(), false);
  assert.equal(usePrivyWallets(), false);

  process.env.PRIVY_SESSION_SIGNER_ID = "quorum_1";
  process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY = "auth_key";
  process.env.WEB_SETUP_PUBLIC_URL = "http://localhost:3001";
  assert.equal(isUsableWebSetupUrl(), false);
  assert.equal(usePrivyWallets(), false);

  process.env.WEB_SETUP_PUBLIC_URL = "https://setup.senda.app";
  assert.equal(isPrivySelfCustodyReady(), true);
  assert.equal(usePrivyWallets(), true);

  process.env.USE_PRIVY_WALLETS = "false";
  assert.equal(usePrivyWallets(), false);

  if (previous.id === undefined) delete process.env.PRIVY_APP_ID;
  else process.env.PRIVY_APP_ID = previous.id;
  if (previous.secret === undefined) delete process.env.PRIVY_APP_SECRET;
  else process.env.PRIVY_APP_SECRET = previous.secret;
  if (previous.flag === undefined) delete process.env.USE_PRIVY_WALLETS;
  else process.env.USE_PRIVY_WALLETS = previous.flag;
  if (previous.signerId === undefined) delete process.env.PRIVY_SESSION_SIGNER_ID;
  else process.env.PRIVY_SESSION_SIGNER_ID = previous.signerId;
  if (previous.signerKey === undefined) {
    delete process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY;
  } else process.env.PRIVY_SESSION_SIGNER_PRIVATE_KEY = previous.signerKey;
  if (previous.web === undefined) delete process.env.WEB_SETUP_PUBLIC_URL;
  else process.env.WEB_SETUP_PUBLIC_URL = previous.web;
  if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous.nodeEnv;
});
