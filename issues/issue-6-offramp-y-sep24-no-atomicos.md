# Offramp y SEP-24 mueven USDC sin atomicidad ni validar el monto del ancla

## Contexto técnico

### Efectivo

`createCashWithdrawal` chequea saldo, llama al partner simulado, **después** transfiere USDC al vault y **recién ahí** guarda la orden con el código.

```51:81:src/services/offramp.service.ts
  const transfer = await transferUsdcFromWallet(user, vault, amount);
  return saveOfframpOrder({ ... pickupCode, txHash: transfer.txHash ... });
```

Si `saveOfframpOrder` falla (disco lleno, JSON corrupto, crash), el USDC ya salió y el usuario no tiene código. El vault por default es la **misma** cuenta operativa (`STELLAR_SECRET_KEY`) si no hay `STELLAR_OFFRAMP_PUBLIC_KEY`.

### Mercado Pago (SEP-24)

`startMercadoPagoWithdraw` obtiene JWT SEP-10, abre el interactive, persiste `pending` y lanza `void watchSep24Transaction` (loop 40 × 8 s en el proceso).

```91:92:src/services/sep24-withdraw.service.ts
  void watchSep24Transaction(phone, jwt, started.id, amount);
```

Al ver `pending_user_transfer_start` paga `Number(tx.amount_in ?? amount)` a `withdraw_anchor_account` **sin** comprobar:

- que `amount_in` ≈ el monto pedido (tolerancia de fees);
- que la cuenta destino sea la del ancla (no un string arbitrario del JSON);
- que el usuario tenga saldo (el start no bloquea USDC);
- `withdraw_memo_type` (si es `hash`/`id`, hoy se corta a 28 chars de texto).

Si el dyno se reinicia, el `void` muere: el usuario tiene el link, el ancla espera, **nadie paga**. El loop que termina por timeout no avisa por WhatsApp.

SEP-10 firma el XDR del challenge **sin** verificar que la source sea el servidor de auth del home domain ni que las operaciones sean las de un challenge SEP-10 (`src/sep/sep10.ts`). El `stellar.toml` se parsea con regex y se cachea para siempre.

## Checklist

- [x] Offramp: persistir orden `pending_lock` **antes** de transferir; si la tx confirma, pasar a `pending_pickup`; si falla el write post-tx, job de reconciliación por `txHash`.
- [x] Vault obligatorio y distinto de la operativa.
- [x] SEP-24: persistir el JWT (cifrado) o re-autenticar; un worker/poller debe retomar txs `pending` al arrancar.
- [x] Rechazar `amount_in` si difiere más de una tolerancia (p. ej. 1%) del monto pedido.
- [x] Validar `withdraw_anchor_account` (G… / C…) y memo según `withdraw_memo_type`.
- [x] Chequear saldo + bloquear (o reservar) antes de mandar el link.
- [x] Avisar por WhatsApp si el poll expira o el proceso se cae (“no pude terminar el retiro”).
- [x] SEP-10: validar challenge (home domain, sequence, operaciones) según SEP-10; no cachear TOML infinito; exigir HTTPS.
- [x] No firmar FeeBump ni XDR que no sea el challenge esperado.

## Criterios de aceptación

- Matar el proceso entre el pago offramp y el `save` deja una orden recuperable (código o reembolso), no un agujero silencioso.
- Un `amount_in` 10× mayor al pedido no se paga.
- Tras restart, una tx SEP-24 `pending_user_transfer_start` se retoma o se cancela con mensaje al usuario.
- El challenge SEP-10 de un home domain distinto se rechaza.
