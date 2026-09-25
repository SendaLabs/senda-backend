# AUDIT — Senda vs Azza / Argentina Builder Challenge

Fecha: 24 sep 2026. Fuentes: código local + Raven (Lumenloop `azza`, SCF #44 *Scaling Azza Across Africa*, docs SEP-7 en [developers.stellar.org/docs/build/apps/wallet/sep7](https://developers.stellar.org/docs/build/apps/wallet/sep7)).

## Qué hay hoy

| Pieza | Estado real |
|---|---|
| WhatsApp + NLU (hola, saldo, envío, efectivo, MP, yield, voz) | En `conversation.service.ts` / `intent.service.ts` |
| Wallet por teléfono | SEP-30 (HKDF) por default. Privy MPC **opcional** (`USE_PRIVY_WALLETS=true`) |
| Firma Stellar | `stellar-signer.ts`: Privy `raw_sign` **o** seed local |
| USDC SAC Testnet | `CDT2MY3QNV2RT2XULQWWXX2JELUWRWNXNKONCYG5MTIGZM7G5S2QNNGB` |
| Offramp efectivo | Simulado (código `SENDA-xxx`) + lock al vault |
| SEP-10 / SEP-24 | `src/sep/` + `sep24-withdraw.service.ts` contra `testanchor.stellar.org` |
| Blend | `blend.service.ts`: **posición por usuario**, no tesorería pooled |
| Contrato `SendaContract` | En `/contracts`. **No** entra al flujo del bot |
| Persistencia | SQLite en `data/senda.db`. `prisma/schema.prisma` documenta el modelo |
| Colas | No hay BullMQ. Todo es in-process |

Azza (directorio Lumenloop, slug `azza`, useazza.com): pagos y ahorro por WhatsApp en África. Una postulación SCF #44 Build, presupuesto USD 89.000, repo [github.com/Blocverse01](https://github.com/Blocverse01). No copiamos su código; copiamos el **patrón** que pidió el brief.

## Qué falta (frente a las 6 tareas)

1. **Privy como wallet de uso diario.** El cliente REST ya existe. No está `@privy-io/node`. El default sigue siendo derivación. Sin credenciales Privy el bot no puede “reemplazar” SEP-30 sin romperse.
2. **Tesorería + Horizon Listener.** No existen `src/stellar/treasury.ts` ni `horizon-listener.ts`. El yield no espera un evento SSE.
3. **Provider Router + doble confirmación.** SEP-24 funciona, pero no hay adapter/router ni “completo solo si ancla **y** Horizon”.
4. **Savings pooled.** Hoy cada usuario llama a Blend. Azza: una posición de lender + ledger off-chain + reconcile diario. Tampoco hay cron horario ni guard de utilización.
5. **QR SEP-7.** No hay `web+stellar:pay` ni envío de imagen.
6. **Evidencia.** README desactualizado (dice “sesión en memoria”; ya se persiste). No lista “qué es nuevo”. Deploy en Render: blocker si no se pushea y no hay `/ready` verde.

## Inconsistencias README vs código

- README: “sesión en memoria”. Código: `sessions.json` en disco.
- README: Privy es un extra. Brief: Privy es la wallet diaria.
- README: Blend “lee la posición on-chain” **del usuario**. Brief: pooled en tesorería.
- Prisma documentado como modelo; el runtime es JSON.
- `SendaContract` documentado como registro de saldos; el saldo real es el SAC USDC.

## Fuera de scope (alcance honesto)

No vamos a fingir estas piezas de Azza en 6 commits:

- PostgreSQL + ORM en producción (queda JSON + schema Prisma)
- BullMQ
- KYC real / tiers verificados
- Bridge (usamos SEP-24)
- MoneyGram / Mercado Pago **producción**
- Mainnet
- Integrar `SendaContract` al flujo (sigue siendo contrato de laboratorio)

## Orden de trabajo

Tareas 1→6, un commit por tarea completa. Este archivo es la foto **antes** de esos commits.
