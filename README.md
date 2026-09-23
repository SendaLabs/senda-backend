# Senda Backend

Backend de **Senda**: un bot de WhatsApp que acredita y consulta fondos en **Stellar Testnet**, con un contrato **Soroban** para registrar saldos.

Cada número de WhatsApp se asocia a una cuenta Stellar por **custodia invisible (SEP-30)**: la cuenta se deriva o se recupera desde el teléfono, sin frases semilla. El usuario no ve claves ni hashes.

Si `USE_PRIVY_WALLETS=true`, esa misma cuenta pasa a una wallet **MPC de Privy** (firma por hash Ed25519). Si Privy falla o el flag está apagado, se sigue usando la custodia local.

## Stack

- Node.js 22.12+ / TypeScript / Express
- WhatsApp Cloud API (Meta)
- `@stellar/stellar-sdk` (Horizon + Soroban RPC)
- Contrato Soroban en Rust (`contracts/`)

## Cómo funciona el bot

1. El primer mensaje dispara un video de bienvenida y el menú. Cada `hola` vuelve a mandar el banner.
2. **Enviar / recibir USDC:** el bot acredita USDC en la cuenta de ese WhatsApp (SAC + Horizon).
3. **Saldo:** consulta el SAC asociado a esa identidad.
4. **Retiro en efectivo:** simula una orden con MoneyGram, Western Union o un comercio Senda y bloquea el USDC transfiriéndolo al vault de offramp.
5. **Retiro a Mercado Pago (SEP-24):** autentica con SEP-10, abre el flujo interactivo del ancla de test y hace polling. Cuando el ancla pide el USDC, el bot lo transfiere con memo.
6. **Rendimiento (Blend Testnet):** «poner a rendir», «cuánto tengo rindiendo» y «sacar de rendir» sobre el pool de Blend.
7. **Notas de voz:** se descargan de Meta, se transcriben con Whisper y se tratan como texto.

## Estructura

```
src/
  index.ts                      # Express, /health y /webhook
  config/flags.ts               # USE_PRIVY_WALLETS y DATABASE_URL
  db/users.repository.ts        # User / Transaction / YieldPosition (JSON)
  wallet/                       # Cliente Privy + firma Stellar (MPC o seed)
  sep/                          # SEP-10 JWT y SEP-24 withdraw
  services/
    conversation.service.ts     # Máquina de estados del bot
    session.service.ts          # Sesión en memoria por teléfono
    intent.service.ts           # NLU: envío, saldo, efectivo, MP, rendimiento
    identity.service.ts         # Identidad SEP-30 (WhatsApp → phone_number)
    derivation.service.ts       # HKDF + passkey lógica por teléfono
    recovery.store.ts           # Registro y recuperación de cuentas
    custody.service.ts          # Custodia invisible / resolve + recover
    stellar.service.ts          # Pagos, contrato y consultas Testnet
    usdc.service.ts             # SAC USDC (acreditar y bloquear)
    offramp.service.ts          # Retiro en efectivo + lock SAC
    sep24-withdraw.service.ts   # Retiro interactivo a Mercado Pago
    blend.service.ts            # Supply / position / withdraw en Blend
    offramp.partners.ts         # MoneyGram / comercios (simulado)
    offramp.store.ts            # Órdenes de retiro
    wallet.store.ts             # Persistencia de secretos (gitignored)
    remittance.service.ts       # Parseo del monto
    whatsapp.media.service.ts   # Descarga de audio de Meta
    transcription.service.ts    # Whisper: nota de voz → texto
  public/                       # Assets locales (video)
prisma/schema.prisma            # Modelo de referencia (SQLite)
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
| `CUSTODY_MASTER_SECRET` | Secreto HKDF para derivar/recuperar cuentas (SEP-30) |
| `STELLAR_OFFRAMP_PUBLIC_KEY` | Vault que recibe el USDC al retirar efectivo |
| `OPENAI_API_KEY` | Clave para transcribir notas de voz con Whisper |
| `OPENAI_TRANSCRIPTION_MODEL` | Modelo de transcripción (default `whisper-1`) |
| `USE_PRIVY_WALLETS` | `true` usa wallets MPC de Privy; `false` (default) deja SEP-30 |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Credenciales de Privy (nunca commitear) |
| `SEP24_HOME_DOMAIN` | Ancla SEP-24 (default `testanchor.stellar.org`) |
| `BLEND_POOL_ID` | Pool Blend Testnet |
| `BLEND_USDC_SAC_ID` | SAC USDC del pool (si falta, usa `USDC_SAC_CONTRACT_ID`) |
| `DATABASE_URL` | Referencia Prisma (`file:../data/senda.db`); el bot usa `data/senda-db.json` |

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

Las identidades SEP-30, wallets y órdenes de retiro viven en `data/` (`identities.json`, `wallets.json`, `offramp-orders.json`, `senda-db.json`, gitignored). En un disco efímero de Render se recrean; con `CUSTODY_MASTER_SECRET` fijo la misma cuenta se vuelve a derivar desde el WhatsApp.

## Wallets Privy (opcional)

Con `USE_PRIVY_WALLETS=true` el bot crea una wallet Stellar en Privy (`owner_id = whatsapp:<teléfono>`) y firma con `raw_sign` sobre el hash Ed25519 de la transacción. Si Privy no responde, cae a la custodia SEP-30. Dejá el flag en `false` en Render hasta tener `PRIVY_APP_ID` y `PRIVY_APP_SECRET`.

## Retiro a Mercado Pago (SEP-24)

Frases como «retirar a Mercado Pago» o «pasar 20 a mi cuenta» inician SEP-10 + SEP-24 contra `testanchor.stellar.org`. El usuario recibe el enlace interactivo. El bot hace polling y, cuando el estado es `pending_user_transfer_start`, manda el USDC al ancla con el memo pedido.

## Rendimiento en Blend

«poner 10 a rendir», «cuánto tengo rindiendo» y «sacar de rendir» hablan con el pool Blend de Testnet (`BLEND_POOL_ID`). La posición se guarda en `data/senda-db.json`. El usuario no ve IDs de contrato ni jerga de DeFi.

## Seguridad

- No subas `.env`, seeds ni `data/wallets.json`.
- El token de Meta y `STELLAR_SECRET_KEY` son secretos.
- Este proyecto está pensado para **Testnet**. No uses seeds de mainnet.
