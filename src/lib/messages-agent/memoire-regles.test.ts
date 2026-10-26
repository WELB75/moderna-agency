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

import { calculerConnaissances, niveauPourPct, SUJETS } from "./memoire-regles.ts";

const ech = (question: string, reponse = "ok", at: string | null = null) => ({ question, reponse, at });

test("niveaux : sans donnée tout est à 0 %, indice global 0", () => {
  const c = calculerConnaissances([], []);
  assert.equal(c.global, 0);
  assert.ok(c.sujets.every((s) => s.pct === 0 && s.niveau === "A découvrir"));
  assert.equal(c.sujets.length, SUJETS.length);
});

test("niveaux : des échanges sur la piscine font monter la piscine, pas le wifi", () => {
  const c = calculerConnaissances([], [ech("La piscine est-elle chauffée ?"), ech("Peut-on se baigner la nuit dans la piscine ?"), ech("Horaires de la piscine")]);
  const piscine = c.sujets.find((s) => s.code === "piscine")!;
  const wifi = c.sujets.find((s) => s.code === "wifi")!;
  assert.equal(piscine.echanges, 3);
  assert.ok(piscine.pct > 0 && piscine.pct <= 60, `piscine ${piscine.pct}`);
  assert.equal(wifi.pct, 0);
});

test("niveaux : une fiche rédigée complète les échanges, plafond à 60 % sans fiche", () => {
  const echanges = Array.from({ length: 40 }, () => ech("Quel est le code wifi ?"));
  assert.ok(calculerConnaissances([], echanges).sujets.find((s) => s.code === "wifi")!.pct <= 60);
  const avec = calculerConnaissances([{ theme: "equipements_wifi", titre: "Wifi", question: "wifi ?", reponse: "Le wifi est dispo", epingle: true }, { theme: "equipements_wifi", titre: "Wifi 2", question: "internet", reponse: "fibre" }], echanges);
  assert.ok(avec.sujets.find((s) => s.code === "wifi")!.pct >= 95);
});

test("niveaux : accents et apostrophes ne gênent pas, les sigles courts ne matchent pas au milieu d'un mot", () => {
  const c = calculerConnaissances([], [ech("Arrivée tardive après minuit possible ?"), ech("Mon adjoint arrive demain")]);
  assert.equal(c.sujets.find((s) => s.code === "arrivee_tardive")!.echanges, 1);
  assert.equal(c.sujets.find((s) => s.code === "bruit_fetes")!.echanges, 0);
});

test("niveaux : les échanges des 7 derniers jours sont comptés", () => {
  const maintenant = new Date("2026-10-26T12:00:00Z");
  const c = calculerConnaissances([], [ech("caution ?", "ok", "2026-10-25T12:00:00Z"), ech("caution ?", "ok", "2026-09-01T12:00:00Z")], maintenant);
  assert.equal(c.cetteSemaine, 1);
  assert.equal(c.sujets.find((s) => s.code === "caution")!.cetteSemaine, 1);
});

test("niveaux : libellés par palier", () => {
  assert.deepEqual([0, 10, 30, 60, 80, 100].map(niveauPourPct), ["A découvrir", "Débutant", "Apprenti", "Confirmé", "Expert", "Maître"]);
});
