# “Mandar plata” acredita desde la operativa sin rate limit ni idempotencia

## Contexto técnico

El intent `send` no transfiere entre usuarios. Llama `creditUserOnTestnet`, que toma `STELLAR_SECRET_KEY` y manda USDC **al WhatsApp que escribió**.

```146:166:src/services/conversation.service.ts
async function executeUsdcTransfer(...) {
  // ...
  const result = await creditUserOnTestnet(to, usdAmount);
```

```313:326:src/services/stellar.service.ts
export async function creditUserOnTestnet(phone: string, usdAmount: number) {
  const user = await getOrCreateUserAccount(phone);
  await ensureUsdcTrustline(user);
  const transfer = await transferUsdc(user.publicKey, usdAmount);
```

Tope de conversación: 500 USDC. Tope interno de `submitUsdcTransfer`: también 500, pero **recorta en silencio** si alguien llama el servicio con más.

```305:307:src/services/usdc.service.ts
  if (amount > MAX_USDC_PER_OPERATION) {
    amount = MAX_USDC_PER_OPERATION;
  }
```

No hay:

- Límite diario / por teléfono / por `message.id`.
- Cola o lock por usuario (dos mensajes “mandar 20” en paralelo = dos pagos).
- Distinción Testnet vs `STELLAR_NETWORK=public` en el flujo de crédito (Friendbot sí se corta en public; el SAC no).
- Autenticación extra: el único gate es el webhook (issue 1).

`getOrCreateUserAccount` además llama Friendbot si la cuenta no existe. Un flood crea cuentas y gasta la operativa en trustlines + USDC.

NLU: cualquier número plausible ≤ 500 en un mensaje se clasifica como `send` (`classifyIntent` fallback `amount !== null → send`). Un “hola 20” mal parseado o un audio transcrito con un número puede disparar crédito.

## Checklist

- [x] Idempotencia: guardar `message.id` → `txHash` y no volver a acreditar el mismo id.
- [x] Lock por `phone` mientras corre `creditUserOnTestnet` / offramp / Blend / SEP-24.
- [x] Rate limit (p. ej. N créditos / hora / teléfono y un techo diario de la operativa).
- [x] Rechazar crédito si `STELLAR_NETWORK` es `public` hasta que el producto lo habilite explícito.
- [x] No recortar montos en silencio: si supera el máximo, error al caller (el bot ya avisa en conversación).
- [x] No tratar un número suelto como `send` salvo que haya verbo de envío o el usuario esté en `AWAITING_USD_AMOUNT`.
- [x] Métricas/alertas cuando la operativa baja de un umbral de USDC/XLM.
- [x] Tests: dos llamadas concurrentes con el mismo `message.id` → una sola `transferUsdc`.

## Criterios de aceptación

- El mismo `message.id` no produce dos `txHash` de crédito.
- Superar el máximo diario bloquea con copy amigable, sin tocar Horizon.
- En `public`, `creditUserOnTestnet` no envía USDC.
- Un mensaje que solo contiene “20” fuera del flujo de envío no mueve fondos.
