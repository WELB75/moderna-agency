import test from "node:test";
import assert from "node:assert/strict";
import { detecterLangue, langueMessage } from "./langue-voyageur.ts";

test("français", () => {
  const r = detecterLangue(["Bonjour, nous arrivons demain vers 15h, merci !", "Est-ce que la villa est loin de la médina ?"]);
  assert.equal(r?.langue, "fr");
  assert.equal(langueMessage(r?.langue), "fr");
});

test("anglais", () => {
  const r = detecterLangue(["Hi! We will arrive tomorrow around 3pm, thanks", "Is there a cook available at the villa?"]);
  assert.equal(r?.langue, "en");
  assert.equal(langueMessage(r?.langue), "en");
});

test("le plus récent l'emporte quand le voyageur change de langue", () => {
  const r = detecterLangue(["Bonjour, merci pour la confirmation", "Hello, we are arriving at 4pm, can we check in early? Thank you", "What time is the check out?"]);
  assert.equal(r?.langue, "en");
});

test("arabe, espagnol, néerlandais → message en anglais", () => {
  assert.equal(detecterLangue(["مرحبا، سنصل غدا في الساعة الثالثة"])?.langue, "ar");
  assert.equal(detecterLangue(["Hola, llegamos mañana por la noche, gracias"])?.langue, "es");
  assert.equal(detecterLangue(["Hallo, wij komen morgen aan, alvast bedankt"])?.langue, "nl");
  assert.equal(langueMessage("es"), "en");
});

test("rien d'exploitable", () => {
  assert.equal(detecterLangue([]), null);
  assert.equal(detecterLangue(["👍", "15h"]), null);
  assert.equal(langueMessage(null), "fr");
});
