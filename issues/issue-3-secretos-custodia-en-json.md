# Las seeds de usuario viven en JSON plano y se derivan con la clave operativa

## Contexto técnico

La custodia SEP-30 deriva la seed del usuario con HKDF. Si falta `CUSTODY_MASTER_SECRET`, usa **la misma** `STELLAR_SECRET_KEY` de la cuenta operativa (la que fondea USDC).

```8:19:src/services/derivation.service.ts
function getMasterSecret(): Buffer {
  const dedicated = process.env.CUSTODY_MASTER_SECRET?.trim();
  const fallback = process.env.STELLAR_SECRET_KEY?.trim();
  const raw = dedicated || fallback;
  // ...
  return Buffer.from(raw, "utf8");
}
```

Después `registerCustodialAccount` / `resolveSecret` persisten `{ publicKey, secretKey }` en `data/wallets.json` sin cifrar:

```18:23:src/services/wallet.store.ts
function writeStore(store: WalletStore): void {
  fs.mkdirSync(path.dirname(WALLETS_PATH), { recursive: true });
  fs.writeFileSync(WALLETS_PATH, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}
```

`mode: 0o600` no aplica en NTFS (desarrollo Windows) y en Render el disco es efímero **pero** un leak de logs, un backup o un snapshot deja todas las seeds. Quien robe `STELLAR_SECRET_KEY` (un solo env) puede:

1. Vaciar la caja operativa.
2. Recalcular **todas** las wallets derivadas (`whatsapp:<telefono>`).

Los otros JSON (`identities.json`, `offramp-orders.json` con códigos de retiro, `senda-db.json`) usan el mismo patrón read/write sin lock. `upsertPrivyUser` y `saveOfframpOrder` pueden perder filas si dos requests coinciden.

Privy tampoco aísla del todo: `resolvePrivyAccount` guarda `privyWalletId` y, si el flag se apaga, el firmante local sigue existiendo en `wallets.json`.

## Checklist

- [ ] Exigir `CUSTODY_MASTER_SECRET` propio; no caer a `STELLAR_SECRET_KEY`. Fallar el boot si falta en cualquier entorno que mueva fondos.
- [ ] Dejar de persistir `secretKey` en claro. Si la cuenta es derivada, recalcular en memoria; no escribir seed a disco.
- [ ] Cifrar en reposo lo que sí haya que guardar (wallets legado, códigos de pickup) con una clave de archivo distinta.
- [ ] Separar roles: clave operativa ≠ master de derivación ≠ vault de offramp.
- [ ] Serializar escrituras a `data/*.json` (mutex/queue) o migrar a SQLite/Prisma de verdad (`schema.prisma` ya existe y no se usa).
- [ ] Rotar `CUSTODY_MASTER_SECRET` documentado: las cuentas ya derivadas no deben “cambiar de dirección” en silencio.
- [ ] Asegurar que `.gitignore` cubre `data/` (ya está) y que ningún script de deploy las copia a la imagen.
- [ ] Revisar que `logSafeError` / `console.error` no impriman `secretKey` al serializar cuentas.

## Criterios de aceptación

- Con solo `STELLAR_SECRET_KEY` y sin `CUSTODY_MASTER_SECRET`, el proceso no deriva wallets ni arranca el listener de webhook (o el path de custodia lanza error controlado).
- `data/wallets.json` (si existe) no contiene strings `S...` de Stellar.
- Dos `createCashWithdrawal` concurrentes no pisan el archivo de órdenes.
- Un reviewer puede rotar la master secret sin que la operativa pierda fondos.
