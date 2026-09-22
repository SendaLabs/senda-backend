# Senda Backend

Backend de **Senda**: un bot de WhatsApp que acredita y consulta fondos en **Stellar Testnet**, con un contrato **Soroban** para registrar saldos.

Cada número de WhatsApp se asocia a una cuenta Stellar. El usuario no carga hashes ni IDs: el backend identifica la sesión y opera en la red.

## Stack

- Node.js 22.12+ / TypeScript / Express
- WhatsApp Cloud API (Meta)
- `@stellar/stellar-sdk` (Horizon + Soroban RPC)
- Contrato Soroban en Rust (`contracts/`)

## Cómo funciona el bot

1. El primer mensaje dispara un video de bienvenida y el menú.
2. **Opción 1 — Recibir / Retirar:** pide un monto, crea (si hace falta) una cuenta Testnet ligada a ese WhatsApp, envía XLM desde la cuenta operativa y, si hay contrato desplegado, invoca `credit`.
3. **Opción 2 — Consultar saldo:** lee Horizon/RPC con la cuenta asociada a ese número.
4. `menu`, `0` o `hola` vuelven al menú (sin reenviar el video).

En Testnet, el monto ingresado se acredita como **XLM** (1 unidad ingresada = 1 XLM). El contrato guarda el monto en centavos.

## Estructura

```
src/
  index.ts                      # Express, /health y /webhook
  services/
    conversation.service.ts     # Máquina de estados del bot
    session.service.ts          # Sesión en memoria por teléfono
    whatsapp.service.ts         # Texto y video nativo (Cloud API)
    stellar.service.ts          # Pagos, contrato y consultas Testnet
    wallet.store.ts             # Persistencia teléfono → keypair
    remittance.service.ts       # Parseo del monto
  public/                       # Assets locales (video)
contracts/                      # SendaContract (Soroban)
scripts/deploy-contract.js      # Build + deploy a Testnet
test-video.js                   # Prueba aislada del video
```

## Requisitos

- Node.js >= 22.12
- Cuenta de [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- Cuenta operativa Stellar Testnet fondeada (Friendbot)
- [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli) (solo para compilar/desplegar el contrato)

## Setup local

```bash
cp .env.example .env
npm install
npm run dev
```

El servidor escucha en `http://localhost:3000` (o el `PORT` del `.env`).

Para que Meta llegue al webhook en local hace falta un túnel (ngrok, Cloudflare Tunnel, etc.) apuntando a:

- `GET /webhook` — verificación (`VERIFY_TOKEN`)
- `POST /webhook` — mensajes entrantes

### Variables de entorno

| Variable | Uso |
|---|---|
| `PORT` | Puerto del servidor |
| `WHATSAPP_TOKEN` | Token de la Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de negocio |
| `VERIFY_TOKEN` | Token de verificación del webhook |
| `WHATSAPP_API_VERSION` | Versión de Graph (default `v22.0`) |
| `STELLAR_NETWORK` | `testnet` o `public` |
| `STELLAR_SECRET_KEY` | Seed de la cuenta operativa (nunca commitear) |
| `STELLAR_PUBLIC_KEY` | Clave pública operativa (opcional) |
| `STELLAR_CONTRACT_ID` | ID `C…` del contrato en Testnet |

Copiá valores reales solo en `.env`. Ese archivo está en `.gitignore`.

## Contrato Soroban

`SendaContract` expone:

- `ping` — health del contrato
- `admin` — admin configurado en el deploy
- `credit(user, amount)` — acredita saldo (solo admin)
- `balance(user)` — saldo persistido

```bash
npm run contract:build
npm run contract:deploy
```

`contract:deploy` usa `STELLAR_SECRET_KEY`, fondea el admin en el constructor y imprime el `STELLAR_CONTRACT_ID` para pegar en `.env` y en Render.

Sin `STELLAR_CONTRACT_ID` el bot igual envía el pago XLM en Horizon; el registro en contrato queda pendiente.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga |
| `npm run build` / `npm start` | Compila y corre `dist/` |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run contract:build` | Compila el WASM |
| `npm run contract:deploy` | Compila y despliega a Testnet |
| `node test-video.js` | Prueba el envío de video (requiere `TO` y credenciales) |

## Deploy (Render)

1. Conectá el repo `main`.
2. Build: `npm install && npm run build`
3. Start: `npm start`
4. Cargá las mismas variables que en `.env` (nunca el archivo `.env`).
5. En Meta, el webhook debe ser `https://<tu-servicio>/webhook`.

Las wallets de usuario se guardan en `data/wallets.json` (también gitignored). En un disco efímero de Render se recrean tras un redeploy; Friendbot vuelve a fondear cuentas nuevas en Testnet.

## Seguridad

- No subas `.env`, seeds ni `data/wallets.json`.
- El token de Meta y `STELLAR_SECRET_KEY` son secretos.
- Este proyecto está pensado para **Testnet**. No uses seeds de mainnet.
