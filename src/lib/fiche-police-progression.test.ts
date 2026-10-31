import test from "node:test";
import assert from "node:assert/strict";
import { ficheTerminee, passeportsManquants } from "./fiche-police-progression.ts";

test("la fiche est complète quand tous les adultes attendus sont enregistrés", () => {
  assert.equal(ficheTerminee(0, 4), false);
  assert.equal(ficheTerminee(2, 4), false);
  assert.equal(ficheTerminee(4, 4), true);
  assert.equal(ficheTerminee(5, 4), true);
});

test("sans nombre attendu, un adulte suffit (fiche libre)", () => {
  assert.equal(ficheTerminee(0, null), false);
  assert.equal(ficheTerminee(1, null), true);
  assert.equal(ficheTerminee(1, 0), true);
});

test("passeports manquants", () => {
  assert.equal(passeportsManquants(1, 4), 3);
  assert.equal(passeportsManquants(4, 4), 0);
  assert.equal(passeportsManquants(2, null), null);
});
