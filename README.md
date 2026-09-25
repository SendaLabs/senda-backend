# Senda Backend

Bot de WhatsApp en español (texto + nota de voz) que mueve **USDC en Stellar Testnet** sin mostrarle claves ni jerga de blockchain al usuario.

Hecho para el **Argentina Builder Challenge (BAF × Stellar), categoría genesis**. La arquitectura copia el **patrón de Azza** (pagos y ahorro por WhatsApp en África; SCF #44) y lo adapta a Argentina: ancla **SEP-24** en vez de Bridge, destino **Mercado Pago / CVU**, y wallets diarias **MPC Privy** en vez de custodia API-level.

## Qué es nuevo en esta iteración

Sobre lo que ya existía (saludo, saldo, envío P2P, retiro a efectivo `SENDA-xxx`):

1. **Wallets MPC vía Privy, self-custodial.** El usuario nuevo recibe un link de un solo uso y abre su wallet **una vez** en `/web-setup` (login SMS con el mismo WhatsApp). Ahí crea la wallet Stellar y delega el session signer de Senda. El backend **no** crea la wallet. SEP-30 queda si `USE_PRIVY_WALLETS=false`.
2. **Tesorería + Horizon Listener.** Cuenta pooled de Senda, trustline USDC, SSE de pagos con reconexión y backoff. Un depósito **no** se confirma hasta el evento de Horizon.
3. **Retiro a Mercado Pago (nuestro “Bridge”).** Provider Router con un adapter SEP-24 (`testanchor.stellar.org` en dev). Completo solo si confirman **el ancla y Horizon**. WhatsApp avisa cada estado.
4. **Ahorro pooled vía Blend v2.** Una tesorería deposita en Blend. El share de cada usuario vive en `YieldPosition` (off-chain). Cron horario + reconciliación diaria. Si el pool está muy usado, se bloquean depósitos.
5. **Cobros QR SEP-7.** «generame un link de cobro» manda `web+stellar:pay` como imagen + texto. Si quien paga también usa Senda, paga desde el chat; si no, el link abre Lobstr/Freighter.

Foto previa de este trabajo: [`AUDIT.md`](./AUDIT.md).

## Custodia (igual que Azza, más Privy)

| Producto | Modelo |
|---|---|
| Saldo diario (enviar, recibir, efectivo, MP, cobros) | Wallet Privy del usuario + session signer de Senda. Fallback SEP-30 si Privy está apagado |
| Rendimiento Blend | **Pooled**: una posición on-chain de Senda. El share se trackea off-chain y se reconcilia |

## Cómo hablarle al bot

Escribí el número o la frase. También una nota de voz.

1. Enviar USDC — `mandar 5`
2. Ver saldo — `cuánto tengo`
3. Retirar en efectivo — `retirar 2 en MoneyGram`
4. Pasar a Mercado Pago — `retirar a mercado pago`
5. Poner a rendir — `poner 1 a rendir`
6. Cuánto tengo rindiendo — `cuánto tengo rindiendo`

También: `generame un link de cobro`. Si te pegan un `web+stellar:pay?...`, Senda intenta pagarlo con tu wallet.

## Arquitectura (nombres al estilo Azza)

```
WhatsApp Bot Service (conversation + NLU + sesiones en data/sessions.json)
  → FiatRamp / Offramp (efectivo simulado + SEP-24)
  → Provider Router (hoy: Sep24AnchorAdapter)
  → Wallet Manager (Privy self-custodial + session signer, o SEP-30)
  → web-setup (Next.js, alta de una sola vez)
  → Stellar Wallet Service / tesorería + Horizon Listener
  → Savings Service → Yield Accounting (cron) → Blend v2
  → QR Payments (SEP-7)
  → JSON en data/  (Prisma es esquema de referencia, no corre)
```

No hay BullMQ ni PostgreSQL en runtime. No los fingimos.

## Stack

- Node.js 22.12+ / TypeScript / Express
- WhatsApp Cloud API (Graph v22)
- Mini sitio `/web-setup` (Next.js + `@privy-io/react-auth`)
- `@stellar/stellar-sdk`, `@privy-io/node`, `@blend-capital/blend-sdk`, `qrcode`
- Contrato Soroban de laboratorio en `contracts/` — **no** entra al flujo del bot

## Setup local

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

Webhook: `GET/POST /webhook`. Health: `/health`. Listo para demo: `/ready`.

Alta web (otro proceso):

```bash
cd web-setup
cp .env.example .env.local
npm install
npm run dev
```

El primer mensaje de un número no registrado manda un link corto `/s/:token` → `/setup?token=`. Después de login SMS + wallet + `addSigners`, el sitio hace `POST /api/link-wallet` y muestra «Listo, volvé a WhatsApp».

## Blockers (alcance honesto)

El jurado pide evidencia **end-to-end en un ambiente desplegado**, no solo local.

- **Deploy:** Render lee `main`. Este trabajo vive en commits de la rama actual y **no está en producción hasta que se haga merge/push a `main`**. Hasta entonces, el e2e desplegado es un **blocker explícito**.
- **Privy:** sin `PRIVY_APP_ID` / `PRIVY_APP_SECRET` en el host, el bot cae a SEP-30. El patrón MPC no se puede demostrar en el deploy vacío.
- **Mercado Pago real:** el ancla de dev es `testanchor.stellar.org`. Alfred Pay / Ripio Ramps quedan como candidatos de producción; no hay CVU real acreditado.
- **Retiro en efectivo:** simulado (código `SENDA-xxx`). No hay MoneyGram ni Western Union en vivo.
- **KYC / tiers:** en Testnet el ahorro no pide documentos.
- **BullMQ, Postgres, Bridge, mainnet:** fuera de scope.

No hay tareas “a medias” en el código. Lo que no llega a producción está acá, no escondido como feature rota.

## Variables nuevas / importantes

| Variable | Uso |
|---|---|
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Activan el flujo Privy (salvo `USE_PRIVY_WALLETS=false`) |
| `PRIVY_SESSION_SIGNER_ID` / `PRIVY_SESSION_SIGNER_PRIVATE_KEY` | Session signer delegado en `/setup` |
| `PRIVY_SPEND_POLICY_ID` | Opcional. Policy de gasto del dashboard |
| `WEB_SETUP_PUBLIC_URL` / `WEB_SETUP_ORIGIN` | Mini sitio de alta + CORS |
| `WHATSAPP_CLICK_TO_CHAT` | Número para el `wa.me` de regreso |
| `STELLAR_TREASURY_SECRET_KEY` | Tesorería pooled. Si falta, usa `STELLAR_SECRET_KEY` |
| `SEP24_HOME_DOMAIN` | Ancla SEP-24 (default `testanchor.stellar.org`) |
| `BLEND_POOL_ID` | Pool Blend Testnet |
| `BLEND_MAX_UTILIZATION` | Tope para aceptar depósitos (default `0.85`) |
| `CUSTODY_MASTER_SECRET` | Fallback SEP-30. Distinto de la operativa |
| `FILE_VAULT_SECRET` | Cifrado en reposo. Distinto de los otros |
| `STELLAR_OFFRAMP_PUBLIC_KEY` | Vault de efectivo. Distinta de la operativa |

Lista completa: `.env.example`. Nunca commitear `.env`.

## Persistencia

Runtime: SQLite en `data/senda.db` (o `SENDA_DATA_DIR/senda.db`). Si quedan JSON viejos, se importan una vez al arrancar. `prisma/schema.prisma` documenta el modelo.

El disco de Render es efímero. Lo que está rindiendo se reconstruye desde Horizon (pagos USDC del usuario a tesorería). Un crédito de «mandar» no se resta; solo baja un retiro con memo `senda-y-out`. Para no perder sesiones ni el mapeo Privy, montá un disco y seteá `SENDA_DATA_DIR`.

## Contrato `SendaContract`

Laboratorio (`ping`, `credit`, `balance`). El saldo que ve el usuario es el **SAC USDC** `CDT2MY3QNV2RT2XULQWWXX2JELUWRWNXNKONCYG5MTIGZM7G5S2QNNGB`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga |
| `npm test` | Tests |
| `npm run typecheck` | TypeScript |
| `npm run build` / `npm start` | `dist/` |
| `npm run contract:build` | WASM de laboratorio |

## Deploy (Render)

1. `main` → build `npm install && npm run build` → start `npm start`
2. Cargar env (nunca el archivo `.env`)
3. Webhook Meta: `https://<servicio>/webhook`
4. Chequear `GET /ready`

Disco efímero: con `CUSTODY_MASTER_SECRET` fijo se rederiva la cuenta SEP-30. Las wallets Privy se crean en `/web-setup` y se guardan en SQLite. El yield se rearma desde Horizon si el `.db` se pierde.

## Seguridad

- Testnet nada más.
- No subir seeds, `.env` ni `data/`.
- El webhook exige firma HMAC de Meta.
