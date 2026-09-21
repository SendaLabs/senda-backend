#!/usr/bin/env node
require("dotenv").config();

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Keypair } = require("@stellar/stellar-sdk");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findWasm() {
  const candidates = [
    path.join("contracts", "target", "wasm32v1-none", "release", "senda.wasm"),
    path.join("target", "wasm32v1-none", "release", "senda.wasm"),
    path.join("contracts", "target", "wasm32-unknown-unknown", "release", "senda.wasm"),
    path.join("target", "wasm32-unknown-unknown", "release", "senda.wasm"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function main() {
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) {
    console.error(
      "Falta STELLAR_SECRET_KEY en .env. Generá una cuenta Testnet y fondeala con Friendbot."
    );
    process.exit(1);
  }

  let publicKey;
  try {
    publicKey = Keypair.fromSecret(secret).publicKey();
  } catch {
    console.error("STELLAR_SECRET_KEY no es un secret seed válido de Stellar.");
    process.exit(1);
  }

  console.log("Compilando contrato Soroban...");
  run("stellar", ["contract", "build", "--manifest-path", "contracts/Cargo.toml"]);

  const wasm = findWasm();
  if (!wasm) {
    console.error("No se encontró el WASM compilado (senda.wasm).");
    process.exit(1);
  }

  console.log(`Desplegando ${wasm} a Testnet...`);
  console.log(`Admin / source: ${publicKey}`);

  const deploy = spawnSync(
    "stellar",
    [
      "contract",
      "deploy",
      "--wasm",
      wasm,
      "--source-account",
      secret,
      "--network",
      "testnet",
      "--",
      "--admin",
      publicKey,
    ],
    { encoding: "utf8", shell: true }
  );

  if (deploy.status !== 0) {
    if (deploy.stderr) {
      process.stderr.write(deploy.stderr);
    }
    if (deploy.stdout) {
      process.stdout.write(deploy.stdout);
    }
    process.exit(deploy.status ?? 1);
  }

  const output = `${deploy.stdout ?? ""}\n${deploy.stderr ?? ""}`;
  process.stdout.write(deploy.stdout ?? "");
  const match = output.match(/C[A-Z0-9]{55,}/);
  if (match) {
    console.log("\nContrato desplegado.");
    console.log(`Agregá esto a .env y a Render:\nSTELLAR_CONTRACT_ID=${match[0]}`);
  }
}

main();
