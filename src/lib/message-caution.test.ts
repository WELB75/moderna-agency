import test from "node:test";
import assert from "node:assert/strict";
import { buildCautionMessage, cautionMessageApplicable } from "./message-templates.ts";

const URL = "https://admin.superhosts.ma/caution/94588314";

test("message de caution : lien, montant et rassurance en français", () => {
  const m = buildCautionMessage("Sofiane", "Villa Tania", 1000, URL, "fr");
  assert.match(m, /Sofiane/);
  assert.match(m, /1[\s  ]000 euros/);
  assert.match(m, /Rien n'est débité/);
  assert.ok(m.includes(URL));
});

test("message de caution : version anglaise", () => {
  const m = buildCautionMessage("Sofiane", "Villa Tania", 950, URL, "en");
  assert.match(m, /950 EUR/);
  assert.match(m, /Nothing is charged/);
  assert.ok(m.includes(URL));
});

test("message de caution : sans montant en euros, pas de montant cité", () => {
  assert.doesNotMatch(buildCautionMessage("A", "V", null, URL, "fr"), /euros/);
});

test("bouton caution : seulement si une caution est à recevoir (jamais Airbnb)", () => {
  const base = { canal: "Direct", caution: "1000.00", cautionPayee: false, beds24BookingId: "94588314" };
  assert.equal(cautionMessageApplicable(base), true);
  assert.equal(cautionMessageApplicable({ ...base, cautionPayee: true }), false);
  assert.equal(cautionMessageApplicable({ ...base, canal: "Airbnb" }), false);
  assert.equal(cautionMessageApplicable({ ...base, caution: null }), false);
  assert.equal(cautionMessageApplicable({ ...base, beds24BookingId: null }), false);
});
