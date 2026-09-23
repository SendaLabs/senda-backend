# Errores de WhatsApp y Stellar se loguean con PII, dumps y mensajes genéricos

## Contexto técnico

Hay un `logSafeError` que evita imprimir headers de Axios (bien, issue histórico 131030). El resto del pipeline sigue filtrando datos:

| Sitio | Qué imprime |
|---|---|
| `src/index.ts` L260 | `JSON.stringify(payload)` del webhook (texto, media ids, nombres) |
| `src/index.ts` L228 | Transcript completo + teléfono |
| `src/index.ts` L155–157 | `from` y `user_id` en claro |
| `src/services/stellar.service.ts` L149, L191, L321, L350 | `console.error` del error crudo (Friendbot, Privy, trustline) |
| `src/services/usdc.service.ts` L40, L182, L218, L315 | `console.error` + `JSON.stringify(error)` en changeTrust |
| `src/services/session.service.ts` L31 | `Sesión ${phone}: paso ...` |

El catch del webhook, si **no** es `WhatsAppSendError`, reenvía `humanizeLedgerError(error)` al usuario. Eso está bien para Stellar, pero cualquier otra excepción (Whisper, JSON, bug) también se traduce a “problema al procesar la red de Stellar”, o peor: si alguien relaja `humanizeLedgerError`, el stack podría salir.

```232:256:src/index.ts
  } catch (error) {
    logSafeError("Webhook: no se pudo responder al usuario", error);
    if (error instanceof WhatsAppSendError) {
      return;
    }
    try {
      await sendWhatsAppMessage(
        incoming.from,
        incoming.kind === "audio"
          ? "No pude escuchar esa nota ahora. ¿Me lo escribís?"
          : humanizeLedgerError(error)
      );
```

Huecos de UX/error:

- Si el video de bienvenida falla, igual se manda el menú (OK), pero un 131030 en el menú deja al usuario sin respuesta y el id ya está marcado como procesado → Meta no reintenta útilmente.
- `WhatsAppSendError` corta el flujo: el crédito **ya pudo haberse enviado** (`executeUsdcTransfer` acredita y después manda el “Listo 💸”). El usuario no se entera y un retry no existe.
- Sesión en memoria: si Render recicla el dyno en `AWAITING_WITHDRAW_AMOUNT`, el siguiente mensaje cae al menú o a un intent suelto.

## Checklist

- [x] Sustituir el dump del webhook por un log estructurado: `messageId`, `type`, `fromHash`.
- [x] No loguear transcripts; como máximo longitud y si hubo texto.
- [x] Reemplazar `console.error(error)` / `JSON.stringify(error)` en Stellar/USDC/Privy/Friendbot por `logSafeError`.
- [x] Separar errores de envío WhatsApp vs ledger vs voz: copy distinto, sin mencionar Stellar/WASM/SAC.
- [x] Si el pago on-chain confirmó y el WhatsApp falló, persistir “ack pendiente” y reintentar el texto (sin reacreditar).
- [x] No marcar `message.id` como procesado hasta terminar el handler, **o** marcar “en curso” y permitir retry solo si no hubo tx.
- [x] Persistir sesión (o al menos el paso + monto pendiente) fuera del `Map` en memoria.
- [x] Test de `logSafeError`: un Axios 400 con `Authorization` no aparece en stdout.

## Criterios de aceptación

- Un grep en logs de una conversación de prueba no muestra el cuerpo del usuario ni el transcript.
- Tras un crédito confirmado + Meta 131030, el usuario puede escribir “¿llegó?” / el bot reenvía el comprobante sin mandar otro USDC.
- `humanizeLedgerError` nunca incluye `HostError`, XDR, hash de contrato ni secretos.
- Reciclar el proceso no pierde un retiro a mitad (o el bot pide el monto de nuevo en vez de ejecutar un intent equivocado).
