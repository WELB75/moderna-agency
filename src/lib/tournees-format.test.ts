import test from "node:test";
import assert from "node:assert/strict";
import { EQUIPE_TOURNEES_DEPART, jourSemaineNumero, passagesDuJour, phraseJour, texteLieu } from "./tournees-format.ts";

const brahim = EQUIPE_TOURNEES_DEPART.find((e) => e.nom === "Brahim")!;
const rachid = EQUIPE_TOURNEES_DEPART.find((e) => e.nom === "Rachid")!;

test("tournées : numéro de jour, lundi = 1 et dimanche = 7", () => {
  assert.equal(jourSemaineNumero(new Date(2026, 10, 2)), 1); // lundi 2 nov. 2026
  assert.equal(jourSemaineNumero(new Date(2026, 10, 8)), 7); // dimanche
  assert.equal(jourSemaineNumero(new Date(2026, 10, 5)), 4); // jeudi
});

test("tournées : Brahim le jeudi est à Noria, 4 appartements", () => {
  assert.equal(texteLieu(passagesDuJour(brahim, 4)[0]), "Noria · 4 appartements");
});

test("tournées : Rachid le lundi a deux domaines", () => {
  const textes = passagesDuJour(rachid, 1).map(texteLieu);
  assert.deepEqual(textes, ["Domaine 17 : villas 13, 15, 14, 16", "Domaine 08 : villas 1, 2, 7"]);
});

test("tournées : dimanche = repos pour les deux", () => {
  assert.equal(texteLieu(passagesDuJour(brahim, 7)[0]), "Repos");
  assert.equal(texteLieu(passagesDuJour(rachid, 7)[0]), "Repos");
});

test("tournées : phrase du jour lisible", () => {
  assert.match(phraseJour(brahim, 2), /^Brahim \(jardinier\), mardi : Domaine 17 : villas 9, 8, 4, 3, 10, 11, 12, 7$/);
});

test("tournées : chaque semaine a 7 jours renseignés pour chacun", () => {
  for (const e of EQUIPE_TOURNEES_DEPART) {
    for (let j = 1; j <= 7; j++) assert.ok(passagesDuJour(e, j).length > 0, `${e.nom} jour ${j}`);
  }
});
