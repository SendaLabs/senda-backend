# Los retries de USDC pueden pagar dos veces y las txs van con fee mínimo

## Contexto técnico

`submitUsdcTransfer` envuelve SAC + fallback Horizon en `withRetry` (3 intentos, sleep 400 ms).

```311:318:src/services/usdc.service.ts
  const txHash = await withRetry(async () => {
    try {
      return await transferUsdcViaSac(from, toPublicKey, stroops);
    } catch (sacError) {
      console.error("SAC transfer, intento Horizon USDC:", sacError);
      return transferUsdcViaHorizon(from, toPublicKey, amount);
    }
  });
```

`transferUsdcViaSac` considera error si `sendTransaction` = `ERROR` **o** si `pollTransaction` no es `SUCCESS`. Caso real: el RPC acepta la tx (`PENDING`/`DUPLICATE`), el poll timeout/falla de red, se lanza, y el retry **firma otra vez** o cae a Horizon. El usuario (o la operativa) paga dos veces.

Lo mismo aplica a `ensureUsdcTrustline` (retry de `changeTrust`) y a Blend (`prepare` + `send` + `poll` sin idempotency key).

Otras fallas Stellar en el código actual:

- Fee fijo `BASE_FEE` (100 stroops) en crédito, offramp, SEP-24, Blend y trustline. En congestión Testnet/mainnet falla; `humanizeLedgerError` dice “la red está ocupada”, el retry del bot puede duplicar.
- `getUsdcBalance` si el SAC falla **devuelve Horizon o 0** (`catch { return 0n }`). Offramp puede creer que no hay saldo, o al revés: un 0 falso bloquea retiros; un fallback desfasado permite lock de más.
- `toUsdcStroops` usa `Math.round(amount * Number(USDC_SCALE))` (float). Montos con muchos decimales no son exactos.
- `creditUserOnTestnet` traga el error de Friendbot de la operativa (`catch { console.error }`) y sigue al transfer.
- No hay simulación previa (`simulateTransaction`) para estimar resources/fees en SAC ni Blend.
- `STELLAR_NETWORK_PASSPHRASE` override independiente de `STELLAR_NETWORK` puede firmar para otra red.

## Checklist

- [ ] No reintentar un `sendTransaction` que devolvió hash. Poll/reconsultar por hash; solo entonces fallback Horizon si **seguro** no llegó.
- [ ] Idempotency: memo o clave `phone+messageId+amount` y consultar pagos recientes antes de firmar.
- [ ] Fee bump / `fee = max(BASE_FEE, latest*n)` en todas las txs (Horizon y Soroban).
- [ ] Simular invocaciones SAC/Blend y abortar si `isSimulationError`.
- [ ] Balance: no tratar un error RPC como 0; distinguir “sin trustline” de “RPC caído”.
- [ ] Stroops con decimal seguro (string o bigint), no `Number * 1e7`.
- [ ] Fallar el crédito si la operativa no está fondeada; no continuar a ciegas.
- [ ] Validar consistencia `STELLAR_NETWORK` ↔ passphrase ↔ Horizon/RPC URLs al boot.
- [ ] Tests: mock de poll timeout después de `PENDING` → un solo pago on-chain.

## Criterios de aceptación

- Un timeout de `pollTransaction` con hash existente no crea una segunda payment Horizon.
- Con fee de red > `BASE_FEE`, las txs de crédito/offramp siguen confirmando (o fallan sin reenviar el monto).
- `getUsdcBalance` ante RPC caído no habilita un offramp “gratis” ni bloquea con saldo 0 falso sin copy de “probá en un rato”.
- El boot con `STELLAR_NETWORK=testnet` y passphrase de public se rechaza.
