import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMetaMediaHost,
  isSupportedVoiceMime,
  sanitizeVoiceFilename,
} from "./whatsapp.media.service";

test("rechaza mime vacío u octet-stream", () => {
  assert.equal(isSupportedVoiceMime(undefined), false);
  assert.equal(isSupportedVoiceMime(""), false);
  assert.equal(isSupportedVoiceMime("application/octet-stream"), false);
  assert.equal(isSupportedVoiceMime("video/mp4"), false);
});

test("acepta mimes de nota de voz de WhatsApp", () => {
  assert.equal(isSupportedVoiceMime("audio/ogg"), true);
  assert.equal(isSupportedVoiceMime("audio/ogg; codecs=opus"), true);
  assert.equal(isSupportedVoiceMime("audio/mpeg"), true);
});

test("solo permite hosts HTTPS de Meta", () => {
  assert.equal(
    isMetaMediaHost("https://lookaside.fbsbx.com/whatsapp/media"),
    true
  );
  assert.equal(
    isMetaMediaHost("https://scontent.xx.fbcdn.net/v/audio.ogg"),
    true
  );
  assert.equal(isMetaMediaHost("https://evil.example/audio.ogg"), false);
  assert.equal(isMetaMediaHost("http://lookaside.fbsbx.com/audio"), false);
});

test("sanitiza filenames para no salir del directorio", () => {
  assert.equal(sanitizeVoiceFilename("../etc/passwd"), "passwd");
  assert.equal(sanitizeVoiceFilename("nota-voz.ogg"), "nota-voz.ogg");
  assert.equal(sanitizeVoiceFilename("a/b/c.ogg"), "c.ogg");
});
