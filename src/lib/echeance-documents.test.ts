import test from "node:test";
import assert from "node:assert/strict";
import { calculerEcheance, dureeCourte, echeanceDocuments } from "./echeance-documents.ts";

const h = (n: number) => n * 60 * 60 * 1000;
const arrivee = new Date("2026-11-10T15:00:00Z");

test("la limite est 24 h avant l'arrivée", () => {
  assert.equal(echeanceDocuments(arrivee).toISOString(), "2026-11-09T15:00:00.000Z");
});

test("dureeCourte", () => {
  assert.equal(dureeCourte(h(2) + 5 * 60_000), "2 h 05");
  assert.equal(dureeCourte(h(26)), "1 j 2 h");
  assert.equal(dureeCourte(h(48)), "2 j");
  assert.equal(dureeCourte(12 * 60_000), "12 min");
  assert.equal(dureeCourte(-h(3)), "3 h");
});

test("tout est prêt dès que fiche complète et contrat signé, quelle que soit l'heure", () => {
  const e = calculerEcheance({ checkIn: arrivee, ficheStatut: "complete", contratStatut: "signe" }, new Date(arrivee.getTime() + h(1)));
  assert.equal(e.etat, "ok");
  assert.deepEqual(e.manquants, []);
});

test("à temps, puis bientôt sous 6 h, puis en retard après la limite, puis arrivé", () => {
  const now48 = new Date(arrivee.getTime() - h(48));
  const aTemps = calculerEcheance({ checkIn: arrivee, ficheStatut: null, contratStatut: "signe" }, now48);
  assert.equal(aTemps.etat, "a_temps");
  assert.deepEqual(aTemps.manquants, ["Fiche police"]);
  assert.equal(aTemps.label, "1 j restantes");

  const bientot = calculerEcheance({ checkIn: arrivee, ficheStatut: "en_attente", contratStatut: null }, new Date(arrivee.getTime() - h(27)));
  assert.equal(bientot.etat, "bientot");
  assert.equal(bientot.tone, "attente");
  assert.deepEqual(bientot.manquants, ["Fiche police", "Contrat"]);
  assert.equal(bientot.label, "3 h restantes");

  const retard = calculerEcheance({ checkIn: arrivee, ficheStatut: "complete", contratStatut: null }, new Date(arrivee.getTime() - h(21)));
  assert.equal(retard.etat, "retard");
  assert.equal(retard.tone, "urgent");
  assert.equal(retard.label, "En retard de 3 h");

  const arrive = calculerEcheance({ checkIn: arrivee, ficheStatut: null, contratStatut: null }, new Date(arrivee.getTime() + h(1)));
  assert.equal(arrive.etat, "arrive");
  assert.equal(arrive.label, "Arrivé sans fiche police + contrat");
});
