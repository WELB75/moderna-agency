import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARIFS_PAR_DEFAUT,
  basculerOption,
  optionIncluse,
  prixOption,
  changerQuantite,
  convertir,
  formuleCuisine,
  libelleCuisine,
  modifierLigne,
  formaterMontant,
  lireNombre,
  montantLigne,
  noteContientUnMontant,
  suggererLignes,
  totalFacture,
  totalParCategorie,
  ventiler,
  type CoutSejour,
  type LigneFacture,
} from "./compta-reservation-format.ts";

// Devis type de la comptable : 360 x 7 nuits + 60 ménage + cuisinière 30 x 6 + piscine 20 x 7
// + ménage journalier 20 x 5 = 3 000 EUR.
const DEVIS: LigneFacture[] = [
  { categorie: "sejour", libelle: "Villa", quantite: 7, prixUnitaire: 360 },
  { categorie: "menage", libelle: "Ménage fin de séjour", quantite: 1, prixUnitaire: 60 },
  { categorie: "cuisine", libelle: "Cuisinière", quantite: 6, prixUnitaire: 30 },
  { categorie: "piscine", libelle: "Piscine chauffée", quantite: 7, prixUnitaire: 20 },
  { categorie: "menage_journalier", libelle: "Ménage journalier", quantite: 5, prixUnitaire: 20 },
];

test("le devis détaillé fait 3 000 EUR", () => {
  assert.equal(totalFacture(DEVIS), 3000);
  assert.equal(montantLigne(DEVIS[0]), 2520);
});

test("totaux par catégorie, dans l'ordre du devis", () => {
  assert.deepEqual(
    totalParCategorie(DEVIS).map((t) => [t.categorie, t.montant]),
    [
      ["sejour", 2520],
      ["menage", 60],
      ["cuisine", 180],
      ["piscine", 140],
      ["menage_journalier", 100],
    ]
  );
});

test("lireNombre accepte virgule, espaces et vide", () => {
  assert.equal(lireNombre("1 200,50"), 1200.5);
  assert.equal(lireNombre(""), 0);
  assert.equal(lireNombre("abc"), 0);
  assert.equal(lireNombre(12), 12);
});

test("suggestion : le loyer est coupé en séjour + ménage", () => {
  const l = suggererLignes({ loyerTotal: 2520 + 60, fraisMenage: 60, nuits: 7 });
  assert.equal(l.length, 2);
  assert.equal(totalFacture(l), 2580);
  assert.equal(l[1].categorie, "menage");
});

test("suggestion : sans loyer ou sans ménage", () => {
  assert.deepEqual(suggererLignes({ loyerTotal: null, fraisMenage: 60, nuits: 3 }), []);
  const l = suggererLignes({ loyerTotal: 900, fraisMenage: null, nuits: 3 });
  assert.equal(l.length, 1);
  assert.equal(l[0].prixUnitaire, 300);
});

test("conversion MAD <-> EUR", () => {
  assert.equal(convertir(220, "MAD", "EUR", 11), 20);
  assert.equal(convertir(20, "EUR", "MAD", 11), 220);
  assert.equal(convertir(20, "EUR", "EUR", 11), 20);
  assert.equal(convertir(200, "DH", "MAD", 11), 200);
});

test("ventilation : encaissé, reste, coûts, solde", () => {
  const couts: CoutSejour[] = [
    { cle: "a", categorie: "menage", libelle: "Ménage", montant: 18.18, montantOrigine: 200, deviseOrigine: "MAD", reel: false, detail: null },
    { cle: "b", categorie: "cuisine", libelle: "Cuisine", montant: 90.91, montantOrigine: 1000, deviseOrigine: "MAD", reel: true, detail: null },
  ];
  const v = ventiler({ devise: "EUR", loyerTotal: 3000, montantPaye: 762, lignes: DEVIS, couts });
  assert.equal(v.facture, 3000);
  assert.equal(v.reste, 2238);
  assert.equal(v.ecartFacture, 0);
  assert.equal(v.totalCouts, 109.09);
  assert.equal(v.solde, 652.91);
});

test("ventilation : sans lignes, le reste se calcule sur le loyer enregistré", () => {
  const v = ventiler({ devise: "EUR", loyerTotal: 2090, montantPaye: 2090, lignes: [], couts: [] });
  assert.equal(v.reste, 0);
  assert.equal(v.ecartFacture, 0);
});

test("ventilation : écart quand les lignes ne collent pas au loyer", () => {
  const v = ventiler({ devise: "EUR", loyerTotal: 2900, montantPaye: 0, lignes: DEVIS, couts: [] });
  assert.equal(v.ecartFacture, 100);
});

test("format des montants", () => {
  assert.equal(formaterMontant(3000, "EUR").replace(/\s| /g, ""), "3000€");
  assert.equal(formaterMontant(200, "MAD").replace(/\s| /g, ""), "200MAD");
});

test("détection des montants dans une note libre", () => {
  assert.equal(noteContientUnMontant("500/ nuit.\nFrais de ménage de fin de séjour: 200dh"), true);
  assert.equal(noteContientUnMontant("acompte de 762 € en virement"), true);
  assert.equal(noteContientUnMontant("Total : 1200"), true);
  assert.equal(noteContientUnMontant("Lit bébé, draps propres pour le canapé"), false);
  assert.equal(noteContientUnMontant("Arrivée tardive : vers 23h"), false);
  assert.equal(noteContientUnMontant("Il y a 4 adultes"), false);
});

test("cocher une option sans détail crée d'abord la ligne séjour", () => {
  const ctx = { nuits: 7, fraisMenage: null, loyerTotal: 2090, tarifs: TARIFS_PAR_DEFAUT };
  const l = basculerOption([], "cuisine", ctx);
  assert.equal(l.length, 2);
  assert.equal(l[0].categorie, "sejour");
  assert.equal(totalFacture([l[0]]), 2090);
  assert.equal(l[1].categorie, "cuisine");
  assert.equal(l[1].quantite, 7);
  assert.equal(totalFacture(l), 2090 + 210);
  const piscine = basculerOption([], "piscine", ctx);
  assert.equal(piscine[1].prixUnitaire, 30);
});

test("décocher retire la ligne, recocher la remet", () => {
  const ctx = { nuits: 3, fraisMenage: null, loyerTotal: 900, tarifs: TARIFS_PAR_DEFAUT };
  const a = basculerOption([], "piscine", ctx);
  const b = basculerOption(a, "piscine", ctx);
  assert.equal(b.some((x) => x.categorie === "piscine"), false);
  assert.equal(basculerOption(b, "piscine", ctx).some((x) => x.categorie === "piscine"), true);
});

test("le ménage reprend les frais de la réservation et n'est pas doublé", () => {
  const ctx = { nuits: 2, fraisMenage: 80, loyerTotal: 500, tarifs: TARIFS_PAR_DEFAUT };
  const l = basculerOption([], "menage", ctx);
  assert.equal(l.filter((x) => x.categorie === "menage").length, 1);
  assert.equal(l.find((x) => x.categorie === "menage")?.prixUnitaire, 80);
  assert.equal(totalFacture(l), 500);
});

test("quantité : jamais en dessous de 1", () => {
  const ctx = { nuits: 2, fraisMenage: null, loyerTotal: 400, tarifs: TARIFS_PAR_DEFAUT };
  const l = basculerOption([], "cuisine", ctx);
  assert.equal(changerQuantite(l, "cuisine", -5).find((x) => x.categorie === "cuisine")?.quantite, 1);
  assert.equal(changerQuantite(l, "cuisine", 1).find((x) => x.categorie === "cuisine")?.quantite, 3);
});

test("prix par logement : villa 80 EUR, appartement 20 EUR, pas de cuisinière ni piscine en appartement", () => {
  const villaR1 = { ...TARIFS_PAR_DEFAUT, menage: 80 };
  const appart = { menage: 20, cuisine: null, cuisineIncluse: false, piscine: null, menageJournalier: 20, menageJournalierIncluse: false };
  assert.equal(prixOption("menage", villaR1, null), 80);
  assert.equal(prixOption("menage", appart, null), 20);
  assert.equal(prixOption("cuisine", appart, null), null);
  assert.equal(prixOption("piscine", appart, null), null);
  assert.equal(prixOption("piscine", villaR1, null), 30);
  // Les frais de ménage réellement facturés sur la réservation priment sur le tarif du logement.
  assert.equal(prixOption("menage", villaR1, 40), 40);
  const ctx = { nuits: 3, fraisMenage: null, loyerTotal: 300, tarifs: appart };
  assert.deepEqual(basculerOption([], "cuisine", ctx), []);
});

test("cuisinière incluse dans le loyer : non proposée", () => {
  const incluse = { ...TARIFS_PAR_DEFAUT, cuisineIncluse: true };
  assert.equal(prixOption("cuisine", incluse, null), null);
});

test("Villa Sofya : la femme de ménage est incluse, pas la cuisinière", () => {
  const sofya = { ...TARIFS_PAR_DEFAUT, menage: 80, menageJournalierIncluse: true };
  assert.equal(optionIncluse("menage_journalier", sofya), true);
  assert.equal(optionIncluse("cuisine", sofya), false);
  assert.equal(prixOption("menage_journalier", sofya, null), null);
  assert.equal(prixOption("cuisine", sofya, null), 30);
});

test("modifierLigne : jours, prix et libellé d'une seule catégorie", () => {
  const lignes: LigneFacture[] = [
    { categorie: "sejour", libelle: "Séjour", quantite: 5, prixUnitaire: 300 },
    { categorie: "piscine", libelle: "Piscine chauffée", quantite: 5, prixUnitaire: 30 },
  ];
  const apres = modifierLigne(lignes, "piscine", { quantite: 3, prixUnitaire: 25 });
  assert.equal(apres[0], lignes[0]);
  assert.equal(apres[1].quantite, 3);
  assert.equal(apres[1].prixUnitaire, 25);
  assert.equal(modifierLigne(lignes, "piscine", { quantite: 0 })[1].quantite, 1);
  assert.equal(modifierLigne(lignes, "piscine", { prixUnitaire: -4 })[1].prixUnitaire, 30);
});

test("formuleCuisine : reconnaît la formule dans le libellé", () => {
  assert.equal(formuleCuisine(libelleCuisine("Petit-déjeuner")), "Petit-déjeuner");
  assert.equal(formuleCuisine(libelleCuisine("Petit-déjeuner et déjeuner")), "Petit-déjeuner et déjeuner");
  assert.equal(formuleCuisine("Service cuisinière"), null);
  assert.equal(formuleCuisine("Petit déj + déjeuner"), "Petit-déjeuner et déjeuner");
});
