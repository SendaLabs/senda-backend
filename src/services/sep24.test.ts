import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { assertSep10Challenge } from "../sep/sep10";
import {
  assertSep24AmountIn,
  isStellarAccount,
} from "./sep24-withdraw.service";
import { getOfframpVaultPublicKey } from "./offramp.service";

test("un amount_in 10 veces mayor no se paga", () => {
  assert.throws(() => assertSep24AmountIn(20, "200"), /otro monto/);
  assert.equal(assertSep24AmountIn(20, "20"), 20);
  assert.equal(assertSep24AmountIn(20, "20.1"), 20.1);
});

test("solo acepta cuentas G o C del ancla", () => {
  const key = Keypair.random().publicKey();
  assert.equal(isStellarAccount(key), true);
  assert.equal(isStellarAccount("not-an-account"), false);
});

test("el desafío SEP-10 de otro home domain se rechaza", () => {
  const server = Keypair.random();
  const client = Keypair.random();
  const account = new Account(server.publicKey(), "-1");
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: "otro-dominio.test auth",
        value: "ok",
        source: client.publicKey(),
      })
    )
    .setTimeout(300)
    .build();

  assert.throws(
    () => assertSep10Challenge(tx, "testanchor.stellar.org", server.publicKey()),
    /home domain/
  );
});

test("el vault de efectivo no puede ser la operativa", () => {
  const ops = Keypair.random();
  process.env.STELLAR_SECRET_KEY = ops.secret();
  process.env.STELLAR_OFFRAMP_PUBLIC_KEY = ops.publicKey();
  assert.throws(() => getOfframpVaultPublicKey(), /misma cuenta operativa/);

  const vault = Keypair.random();
  process.env.STELLAR_OFFRAMP_PUBLIC_KEY = vault.publicKey();
  assert.equal(getOfframpVaultPublicKey(), vault.publicKey());
});
