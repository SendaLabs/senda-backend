import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectLocale,
  inferLocale,
  isGreeting,
  welcomeMenuText,
  welcomeVideoCaption,
} from "./locale";
import { buildSetupInviteText, buildSetupReadyText } from "./copy";

test("hello cambia a inglés y hola se queda en español", () => {
  assert.equal(detectLocale("hello"), "en");
  assert.equal(detectLocale("Hi!"), "en");
  assert.equal(detectLocale("good morning"), "en");
  assert.equal(detectLocale("hola"), "es");
  assert.equal(detectLocale("buenas tardes"), "es");
  assert.equal(detectLocale("mandar 10"), null);
  assert.equal(isGreeting("hello"), true);
  assert.equal(isGreeting("hola"), true);
  assert.equal(isGreeting("send 10"), false);
  assert.equal(inferLocale("send 10 dollars"), "en");
  assert.equal(inferLocale("what's my balance"), "en");
  assert.equal(inferLocale("mandar 10 dolares"), "es");
});

test("la bienvenida y el menú existen en los dos idiomas", () => {
  const esCaption = welcomeVideoCaption("Ana", "es");
  const enCaption = welcomeVideoCaption("Ana", "en");
  assert.match(esCaption, /Hola, Ana/);
  assert.match(esCaption, /💚/);
  assert.match(enCaption, /Hi, Ana/);
  assert.match(enCaption, /💚/);
  assert.doesNotMatch(enCaption, /Hola/);

  const esMenu = welcomeMenuText("Ana", "es");
  const enMenu = welcomeMenuText("Ana", "en");
  assert.match(esMenu, /en qué te puedo ayudar/);
  assert.match(enMenu, /how can I help/i);
  assert.doesNotMatch(enMenu, /comandos/);
  assert.doesNotMatch(esMenu, /efectivo|MoneyGram/i);
  assert.doesNotMatch(enMenu, /cash out|MoneyGram/i);
});

test("el alta Privy también tiene inglés sin sacar el español", () => {
  const es = buildSetupInviteText("Ana", "es");
  const en = buildSetupInviteText("Ana", "en");
  assert.match(es, /email/);
  assert.match(es, /Abrir mi cuenta/);
  assert.match(es, /volvés al chat/);
  assert.doesNotMatch(es, /onrender\.com|https?:\/\//i);
  assert.match(en, /email/);
  assert.match(en, /Open my account/);
  assert.match(buildSetupReadyText("en"), /Your account is all set/);
  assert.match(buildSetupReadyText("es"), /creada con éxito/);
});
