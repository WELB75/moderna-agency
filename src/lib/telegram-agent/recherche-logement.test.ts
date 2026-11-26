import test from "node:test";
import assert from "node:assert/strict";
import { trouverLogement } from "./recherche-logement.ts";

const liste = [
  { nom: "Villa Wimiliim", numero: "1" },
  { nom: "Villa Lila", numero: "2" },
  { nom: "Maeva Cosy", numero: "3" },
  { nom: "Villa Sofya", numero: "4" },
  { nom: "Mya cosy", numero: "5" },
  { nom: "Mama cosy", numero: "6" },
];
const noms = (q: string) => trouverLogement(liste, q).map((v) => v.nom);

test("exact et sans le mot villa", () => {
  assert.deepEqual(noms("Villa Sofya"), ["Villa Sofya"]);
  assert.deepEqual(noms("sofya"), ["Villa Sofya"]);
});
test("faute de frappe : Wimillim et Lilas", () => {
  assert.deepEqual(noms("Wimillim"), ["Villa Wimiliim"]);
  assert.deepEqual(noms("Villa Lilas"), ["Villa Lila"]);
});
test("Eva cosy ne tombe plus sur Maeva Cosy", () => {
  assert.deepEqual(noms("Eva cosy"), []);
});
test("Mya et Mama restent distincts", () => {
  assert.deepEqual(noms("Mya"), ["Mya cosy"]);
  assert.deepEqual(noms("Mama cosy"), ["Mama cosy"]);
});
test("numéro", () => {
  assert.deepEqual(noms("n°4"), ["Villa Sofya"]);
});
