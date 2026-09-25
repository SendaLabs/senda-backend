# web-setup

Única superficie web de Senda. Un usuario nuevo la abre **una vez** desde el
link corto que manda WhatsApp (`/s/:token` → `/setup?token=`).

1. Login SMS de Privy (`loginMethods: ['sms']`), mismo número de WhatsApp.
2. `useCreateWallet({ chainType: 'stellar' })`.
3. `addSigners()` con el session signer y la policy de gasto (500 / 2000 USDC).
4. `POST /api/link-wallet` en el backend.
5. «Listo, volvé a WhatsApp» → `wa.me`.

```bash
cp .env.example .env.local
npm install
npm run dev
```
