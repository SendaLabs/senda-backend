# web-setup

Única superficie web de Senda. Un usuario nuevo la abre **una vez** desde el
link corto que manda WhatsApp (`/s/:token` → `/setup?token=`).

1. Login email de Privy (`loginMethods: ['email']`). El WhatsApp queda ligado por el token del link.
2. `useCreateWallet({ chainType: 'stellar' })`.
3. `addSigners()` con el session signer (la policy de gasto es opcional).
4. `POST /api/link-wallet` en el backend.
5. «Listo, volvé a WhatsApp» → `wa.me`.

```bash
cp .env.example .env.local
npm install
npm run dev
```
