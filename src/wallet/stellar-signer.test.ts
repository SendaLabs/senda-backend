import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { signStellarTransaction } from "./stellar-signer";

function buildPayment(source: string) {
  const account = new Account(source, "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: "1",
      })
    )
    .setTimeout(30)
    .build();
}

test("sin Privy firma con la seed local y no guarda el hash crudo", async () => {
  process.env.USE_PRIVY_WALLETS = "false";
  const keypair = Keypair.random();
  const tx = buildPayment(keypair.publicKey());
  await signStellarTransaction(
    { publicKey: keypair.publicKey(), secretKey: keypair.secret() },
    tx
  );
  assert.equal(tx.signatures.length, 1);
});

test("con privyWalletId arma hash, pide raw_sign y adjunta la firma", async () => {
  process.env.USE_PRIVY_WALLETS = "true";
  const keypair = Keypair.random();
  const tx = buildPayment(keypair.publicKey());
  const expectedHash = Buffer.from(tx.hash()).toString("hex");

  const privy = require("./privy-client") as typeof import("./privy-client");
  const original = privy.signStellarHash;
  let seenWallet = "";
  let seenHash = "";
  privy.signStellarHash = async (walletId: string, hash: Buffer) => {
    seenWallet = walletId;
    seenHash = hash.toString("hex");
    return Buffer.from(keypair.sign(hash));
  };

  try {
    await signStellarTransaction(
      {
        publicKey: keypair.publicKey(),
        privyWalletId: "wallet_mpc_1",
      },
      tx
    );
    assert.equal(seenWallet, "wallet_mpc_1");
    assert.equal(seenHash, expectedHash);
    assert.equal(tx.signatures.length, 1);
  } finally {
    privy.signStellarHash = original;
    delete process.env.USE_PRIVY_WALLETS;
  }
});
