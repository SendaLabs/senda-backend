# Whisper escribe temporales que no usa y descarga audio sin tope de tamaño

## Contexto técnico

`transcribeAudioBuffer` arma un path en `os.tmpdir()` (`senda-voice-<uuid>-<filename>`), hace `writeFile` y en el `finally` intenta `unlink`. El upload a OpenAI **no lee ese archivo**: manda un `Blob` del buffer en memoria.

```32:64:src/services/transcription.service.ts
  const tempPath = join(tmpdir(), `senda-voice-${randomUUID()}-${filename}`);

  try {
    await writeFile(tempPath, buffer);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/ogg" }),
      filename
    );
    // ...
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
```

Problemas reales:

1. El temporal es código muerto. Si el proceso muere entre `writeFile` y `unlink`, queda audio de usuarios en el disco del contenedor (`/tmp/senda-voice-*`).
2. `downloadWhatsAppMedia` no setea `maxContentLength` / `maxBodyLength`. Un `mediaId` (o una URL de Meta comprometida) puede bajar decenas de MB a RAM y, hoy, también a disco.
3. `isSupportedVoiceMime(undefined)` devuelve `true`, así que un audio sin `mime_type` se acepta.
4. No se valida que `data.url` sea un host de Facebook/Meta antes del GET autenticado (seguimiento de redirects).
5. El filename se concatena al path temporal. Hoy es `nota-voz` + extensión derivada del mime; si eso cambia y entra un `../`, hay path traversal.

```37:53:src/services/whatsapp.media.service.ts
export function isSupportedVoiceMime(mimeType?: string): boolean {
  if (!mimeType) {
    return true;
  }
  // ...
}
```

```71:74:src/services/whatsapp.media.service.ts
    const { data: binary } = await axios.get<ArrayBuffer>(data.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });
```

## Checklist

- [x] Eliminar el `writeFile`/`unlink` si Whisper se llama con `Blob`/`Buffer`. No tocar el disco.
- [x] Si se necesita archivo (SDK que exige path): `mkdtemp` + nombre fijo (`audio.ogg`), `try/finally` que borre el directorio, y un job de arranque que limpie `senda-voice-*` huérfanos.
- [x] Poner `maxContentLength` y `maxBodyLength` (p. ej. 16 MB, alineado a WhatsApp) en metadata y download.
- [x] Rechazar mime ausente o fuera de allowlist (`audio/ogg`, `audio/opus`, `audio/mpeg`, `audio/mp4`, `audio/amr`, `audio/wav`).
- [x] Validar host de `data.url` (facebook, fbcdn, whatsapp) **antes** de descargar; no seguir redirects a hosts arbitrarios.
- [x] Sanitizar cualquier filename (solo `[a-z0-9.-]`, sin `/` ni `..`).
- [x] No loguear el transcript completo (`index.ts` hoy hace `Voz transcrita de ${from}: ${transcript}`).
- [x] Cubrir con test: mime vacío → error; buffer > tope → no escribe disco ni llama a OpenAI.

## Criterios de aceptación

- Transcribir una nota de voz no crea archivos en `os.tmpdir()` (o, si existen, se borran aunque falle OpenAI o se mate el proceso a mitad).
- Un download > tope configurado aborta y el usuario recibe el mensaje amigable ya existente (“No pude entender esa nota…”), sin OOM.
- Audio sin mime o con `application/octet-stream` no se manda a Whisper.
- `GET` a una URL que no sea de Meta no se ejecuta.
