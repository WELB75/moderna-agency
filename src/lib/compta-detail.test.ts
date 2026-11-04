import { test } from "node:test";
import assert from "node:assert/strict";
import { detailComptable, totalDetail } from "./compta-detail.ts";

test("lignes de facture : une colonne par catégorie", () => {
  const d = detailComptable({
    lignes: [
      { categorie: "sejour", libelle: "5 nuits", quantite: 5, prixUnitaire: 300 },
      { categorie: "menage", libelle: "Ménage", quantite: 1, prixUnitaire: 80 },
      { categorie: "cuisine", libelle: "Cuisinière", quantite: 4, prixUnitaire: 30 },
      { categorie: "menage_journalier", libelle: "Ménage", quantite: 2, prixUnitaire: 20 },
      { categorie: "piscine", libelle: "Pompe", quantite: 3, prixUnitaire: 30 },
    ],
    loyerTotal: 0,
    revenus: null,
  });
  assert.deepEqual([d.location, d.menageCheckout, d.cuisine, d.menageExtra, d.pompeAChaleur], [1500, 80, 120, 40, 90]);
  assert.equal(totalDetail(d), 1830);
});

test("Airbnb sans lignes : chambre et ménage de la plateforme", () => {
  const d = detailComptable({ lignes: [], loyerTotal: 122, revenus: { fraisChambre: 102, fraisMenage: 20 } });
  assert.equal(d.source, "plateforme");
  assert.equal(d.location, 102);
  assert.equal(d.menageCheckout, 20);
});

test("rien de détaillé : le loyer total est la location", () => {
  const d = detailComptable({ lignes: [], loyerTotal: 900, revenus: null });
  assert.equal(d.source, "non_detaille");
  assert.equal(d.location, 900);
});
