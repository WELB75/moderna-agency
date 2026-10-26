import test from "node:test";
import assert from "node:assert/strict";
import { anonymiser, blocMemoire, type FicheMemoire } from "./memoire-regles.ts";

test("anonymisation : emails, liens et téléphones disparaissent", () => {
  const t = anonymiser("Écris à john.doe@gmail.com ou appelle le +33 6 12 34 56 78, voir https://maps.app.goo.gl/abc123 et www.exemple.com/x");
  assert.ok(!t.includes("@") && !t.includes("+33") && !t.includes("http") && !t.includes("www."));
  assert.ok(t.includes("[email]") && t.includes("[téléphone]") && t.includes("[lien]"));
});

test("anonymisation : les codes d'accès et wifi sont retirés", () => {
  assert.equal(anonymiser("Le code du boîtier est 4821, wifi 12345678."), "Le code du boîtier est [code], wifi [code].");
});

test("anonymisation : prix, années et dates sont conservés", () => {
  const t = "La caution est de 1000 € (ou 1000 euros), le ménage 300 MAD, séjour en 2026 du 2026-10-24 au 12/11/2026.";
  assert.equal(anonymiser(t), t);
});

test("anonymisation : le nom du voyageur est remplacé, pas les mots proches", () => {
  const t = anonymiser("Bonjour Mads Rezaei, merci Mogensen ! Madsen n'est pas lui.", ["Mads Rezaei Mogensen"]);
  assert.equal(t, "Bonjour [prénom] [prénom], merci [prénom] ! Madsen n'est pas lui.");
});

test("anonymisation : les mots neutres du nom ne sont pas remplacés", () => {
  assert.equal(anonymiser("La villa est prête", ["Villa Azur"]), "La villa est prête");
});

const fiche = (o: Partial<FicheMemoire>): FicheMemoire => ({
  id: "x", theme: "piscine_exterieur", titre: "Piscine chauffée", question: "q", reponse: "r", villaNom: null, nbSources: 1, ...o,
});

test("bloc mémoire : fiches générales + celles du logement, pas celles des autres", () => {
  const bloc = blocMemoire(
    [fiche({ id: "a", titre: "Générale" }), fiche({ id: "b", titre: "Azur seulement", villaNom: "Villa Azur" }), fiche({ id: "c", titre: "Lila seulement", villaNom: "Villa Lila" })],
    "Villa Azur"
  );
  assert.ok(bloc.includes("Générale") && bloc.includes("Azur seulement"));
  assert.ok(!bloc.includes("Lila seulement"));
});

test("bloc mémoire : respecte le budget et renvoie vide sans fiche", () => {
  assert.equal(blocMemoire([], "Villa Azur"), "");
  const grosses = Array.from({ length: 10 }, (_, i) => fiche({ id: String(i), titre: `T${i}`, reponse: "x".repeat(500) }));
  assert.ok(blocMemoire(grosses, null, 1500).length <= 1500);
});

test("bloc mémoire : les plus confirmées passent d'abord", () => {
  const bloc = blocMemoire([fiche({ titre: "Rare", nbSources: 1 }), fiche({ titre: "Fréquente", nbSources: 9 })], null);
  assert.ok(bloc.indexOf("Fréquente") < bloc.indexOf("Rare"));
});
