import { test } from "node:test";
import assert from "node:assert/strict";
import { prixDirect } from "./prix-direct.ts";

const plateforme = { min: 340, base: 450, max: 750 };
const direct = { min: 390, base: 530, max: 780 };

test("les trois points de repère", () => {
  assert.equal(prixDirect(340, plateforme, direct), 390);
  assert.equal(prixDirect(450, plateforme, direct), 530);
  assert.equal(prixDirect(750, plateforme, direct), 780);
});

test("proportionnel entre les points", () => {
  assert.equal(prixDirect(395, plateforme, direct), 460);
  assert.equal(prixDirect(600, plateforme, direct), 655);
});

test("borné hors fourchette", () => {
  assert.equal(prixDirect(300, plateforme, direct), 390);
  assert.equal(prixDirect(900, plateforme, direct), 780);
});

test("fourchette inconnue ou incohérente : prix inchangé", () => {
  assert.equal(prixDirect(500, null, direct), 500);
  assert.equal(prixDirect(500, plateforme, null), 500);
  assert.equal(prixDirect(500, { min: 500, base: 400, max: 300 }, direct), 500);
});
