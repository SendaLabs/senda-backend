# El webhook de WhatsApp acepta POST sin firma y el GET se puede verificar vacío

## Contexto técnico

`POST /webhook` responde `200` de inmediato y procesa `req.body` **sin** validar `X-Hub-Signature-256` ni ningún secreto de la app de Meta. No hay ninguna referencia a firma HMAC en `src/`.

```268:271:src/index.ts
app.post("/webhook", (req: Request, res: Response) => {
  res.sendStatus(200);
  void processIncomingWebhook(req.body);
});
```

Quien conozca la URL pública (Render) puede fabricar un payload con `entry[].changes[].value.messages[]` y un `from` / `wa_id` arbitrario. Eso dispara crédito de USDC (`creditUserOnTestnet`), retiro en efectivo, SEP-24 y Blend.

El GET de verificación es igual de frágil: compara `hub.verify_token` con `process.env.VERIFY_TOKEN` usando `===`. Si `VERIFY_TOKEN` no está definido y el query no manda token, ambos son `undefined` y el challenge se acepta.

```28:40:src/index.ts
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});
```

La deduplicación (`processedMessageIds`) vive en un `Map` en memoria, TTL 10 minutos. No sobrevive restart ni dos instancias. Si `message.id` falta, `rememberMessage` devuelve `false` y el mensaje **siempre** se procesa.

El payload completo se loguea con `JSON.stringify(payload)` antes de filtrar.

## Checklist

- [ ] Validar `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` (HMAC-SHA256 del raw body) **antes** de parsear/ejecutar el handler.
- [ ] Usar `express.raw` o `verify` de `express.json` para firmar el body original; no re-serializar JSON.
- [ ] Comparar firma y `VERIFY_TOKEN` con `crypto.timingSafeEqual` sobre buffers de igual longitud.
- [ ] Rechazar GET si `VERIFY_TOKEN` está vacío o ausente (nunca `undefined === undefined`).
- [ ] Responder `401/403` y no procesar si la firma falta o no coincide.
- [ ] Persistir IDs de mensaje procesados (archivo/DB) con TTL, no solo `Map` en proceso.
- [ ] Ignorar mensajes sin `id` o exigir `id` para cualquier acción que mueva fondos.
- [ ] Dejar de loguear el webhook completo; loguear solo `message.id`, tipo y un hash del `from`.
- [ ] Agregar una prueba que envíe un POST sin firma y otra con firma inválida: no deben llamar a `handleIncomingWhatsAppMessage`.
- [ ] Documentar `WHATSAPP_APP_SECRET` en `.env.example` y Render (sin commitear el valor).

## Criterios de aceptación

- Un POST a `/webhook` sin header de firma, o con firma incorrecta, no acredita USDC ni inicia retiros.
- Con `VERIFY_TOKEN` ausente, `GET /webhook?hub.mode=subscribe` responde 403 aunque no venga `hub.verify_token`.
- Dos deliveries del mismo `message.id` (restart o segunda instancia) no ejecutan dos créditos.
- Los logs de Render no contienen el texto del usuario ni el JSON crudo de Meta.
