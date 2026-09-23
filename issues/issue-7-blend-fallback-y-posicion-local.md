# Blend traga errores del SDK, arma un `submit` inválido y miente el saldo rindiendo

## Contexto técnico

`submitBlendRequest` intenta `@blend-capital/blend-sdk`. Cualquier throw (SDK mal importado, args, XDR) cae a un `pool.call("submit", …, nativeToScVal([{ request_type, address, amount }]))`.

Ese vec **no** es el tipo `Request` del pool (enum + Address + i128). En el mejor caso Soroban rechaza; en el peor se simula/prepara mal y el usuario ve un error críptico humanizado como “la red está ocupada”.

```90:104:src/services/blend.service.ts
  } catch {
    operation = pool.call(
      "submit",
      Address.fromString(user.publicKey).toScVal(),
      // ...
      nativeToScVal([{ request_type, address: getBlendUsdcId(), amount: stroops }])
    );
  }
```

Después de un `SUCCESS` on-chain, `supplyToBlend` / `withdrawFromBlend` **suman o restan** un float en `data/senda-db.json`. `getBlendPosition` solo lee ese JSON: no consulta el pool, no lee bTokens, no aplica interés.

```127:160:src/services/blend.service.ts
  const current = (await findYieldPosition(phone))?.lastSyncedValueUsdc ?? "0";
  const next = (Number(current) + amount).toFixed(2);
  await upsertYieldPosition(phone, next, next);
  // ...
  const stored = await findYieldPosition(phone);
  return { currentValueUsdc: stored?.lastSyncedValueUsdc ?? "0" };
```

Tampoco hay:

- `approve` / trustline del USDC del pool (puede ser otro SAC: `BLEND_USDC_SAC_ID`);
- chequeo de saldo antes de supply;
- fee bump (solo `BASE_FEE`);
- distinción entre Supply y SupplyCollateral (se usa collateral = 2).

El usuario puede oír “ya dejamos 10 dólares rindiendo” cuando el JSON se actualizó y el ledger no, o al revés.

## Checklist

- [x] Quitar el fallback silencioso. Si el SDK no arma la op, fallar con error de negocio.
- [x] Tipar `PoolContract.submit` y `RequestType` sin `require` suelto (import ESM/CJS estable).
- [x] Antes de supply: saldo USDC, trustline/allowance del reserve correcto.
- [x] Leer la posición on-chain (bTokens / collateral) al consultar; el JSON solo como cache.
- [x] No usar `Number` para stroops; persistir enteros (i128) o string de stroops.
- [x] Copy de error: “no pude poner esa plata a rendir”, sin HostError.
- [ ] Test de integración Testnet: supply 1 USDC → `getBlendPosition` refleja el pool, no `n+1` local.
- [x] Documentar qué request type se usa y por qué (collateral vs supply).

## Criterios de aceptación

- Con el SDK ausente o `submit` mal tipado, no se envía una transacción a Soroban.
- “cuánto tengo rindiendo” coincide con el pool (± redondeo de 7 decimales), no con un contador local.
- Supply sin saldo no construye tx.
- Un supply confirmado y un crash antes del JSON no deja al usuario en “0 rindiendo” para siempre (resync al consultar).
