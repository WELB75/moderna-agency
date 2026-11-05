import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerRevenusPlateforme, estCanalPlateforme, nuiteesDeRateDescription, prixBeds24DeRawData } from "./revenus-plateforme.ts";

// Capture Airbnb de la comptable : 2 nuits, chambre 102,00, ménage 20,00, frais de service -22,69,
// le voyageur paie 122,00 (le net que reçoit l'hôte est 99,31).
test("exemple Airbnb : lignes de facture et commission", () => {
  const r = calculerRevenusPlateforme(
    {
      price: 122,
      commission: 22.69,
      invoiceItems: [
        { type: "charge", description: "Frais de chambre pour 2 nuits", qty: 1, amount: 102 },
        { type: "charge", description: "Frais de ménage", qty: 1, amount: 20 },
      ],
    },
    122,
    null
  );
  assert.ok(r);
  assert.equal(r.fraisChambre, 102);
  assert.equal(r.fraisMenage, 20);
  assert.equal(r.fraisServiceHote, 22.69);
  assert.equal(r.prixNetNuitees, 59.31);
  assert.equal(r.netSansMenage, false);
  assert.equal(r.origineMenage, "plateforme");
  assert.equal(r.origineChambre, "lignes");
});

test("sans lignes : chambre = total - ménage de la réservation", () => {
  const r = calculerRevenusPlateforme({ price: 122, commission: 22.69, invoiceItems: [] }, 122, 20);
  assert.ok(r);
  assert.equal(r.fraisChambre, 102);
  assert.equal(r.fraisMenage, 20);
  assert.equal(r.origineMenage, "reservation");
  assert.equal(r.origineChambre, "calcule");
  assert.equal(r.prixNetNuitees, 59.31);
});

test("commission absente : net inconnu, pas inventé", () => {
  const r = calculerRevenusPlateforme({ price: 300, invoiceItems: [] }, 300, null);
  assert.ok(r);
  assert.equal(r.fraisServiceHote, null);
  assert.equal(r.prixNetNuitees, null);
  assert.equal(r.fraisChambre, 300);
  assert.equal(r.origineMenage, "aucun");
});

test("commission lue dans une ligne négative", () => {
  const r = calculerRevenusPlateforme(
    { price: 200, invoiceItems: [{ description: "Room", amount: 180 }, { description: "Cleaning fee", amount: 20 }, { description: "Host service fee", amount: -30 }] },
    200,
    null
  );
  assert.ok(r);
  assert.equal(r.fraisServiceHote, 30);
  assert.equal(r.fraisChambre, 180);
  assert.equal(r.prixNetNuitees, 130);
});

test("annonce en dirhams : tout est ramené à l'échelle du loyer en euros", () => {
  const r = calculerRevenusPlateforme({ price: 1220, commission: 226.9, invoiceItems: [{ description: "Nuits", amount: 1020 }, { description: "Ménage", amount: 200 }] }, 122, null);
  assert.ok(r);
  assert.equal(r.fraisChambre, 102);
  assert.equal(r.fraisMenage, 20);
  assert.equal(r.fraisServiceHote, 22.69);
});

test("pas de données : null", () => {
  assert.equal(calculerRevenusPlateforme(null, 100, null), null);
  assert.equal(calculerRevenusPlateforme({ price: 0 }, null, null), null);
  assert.equal(prixBeds24DeRawData({ beds24Status: "confirmed" }), null);
  assert.deepEqual(prixBeds24DeRawData({ beds24Prix: { price: 5 } }), { price: 5 });
});

test("canaux concernés", () => {
  assert.equal(estCanalPlateforme("Airbnb"), true);
  assert.equal(estCanalPlateforme("Booking.com"), true);
  assert.equal(estCanalPlateforme("Direct"), false);
  assert.equal(estCanalPlateforme(null), false);
});

// Réservation Airbnb de la comptable (2026-11-04) : Airbnb affiche 258,00 de chambre pour 5 nuits,
// 20,00 de ménage, -51,71 de frais de service (l'hôte gagne 226,29). Beds24 ne renvoie qu'une ligne
// de 226,29 : c'est le net après commission, pas le prix de la chambre.
test("ligne Beds24 = prix voyageur - commission : chambre = total - ménage", () => {
  const r = calculerRevenusPlateforme(
    { price: 278, commission: 51.71, invoiceItems: [{ type: "charge", description: "[ROOMNAME1] [FIRSTNIGHT] - [LEAVINGDAY]", qty: 1, amount: 226.29, lineTotal: 226.29 }] },
    278,
    20
  );
  assert.ok(r);
  assert.equal(r.fraisChambre, 258);
  assert.equal(r.fraisMenage, 20);
  assert.equal(r.fraisServiceHote, 51.71);
  assert.equal(r.origineChambre, "calcule");
});

// Seconde capture de la comptable : 122 € payés, une ligne Beds24 de 99,31 (= 122 − 22,69) et aucun
// ménage saisi sur la réservation ; avec le ménage de la fiche du logement (20 €), on retrouve
// les chiffres d'Airbnb : chambre 102,00, ménage 20,00, service 22,69.
test("ligne nette de commission + ménage de la fiche : chiffres d'Airbnb", () => {
  const r = calculerRevenusPlateforme({ price: 122, commission: 22.69, invoiceItems: [{ type: "charge", description: "[ROOMNAME1]", amount: 99.31 }] }, 122, 20);
  assert.ok(r);
  assert.equal(r.fraisChambre, 102);
  assert.equal(r.fraisMenage, 20);
  assert.equal(r.prixNetNuitees, 59.31);
});

// Sanaa, 2026-11-04 : pour Airbnb seulement, net des nuitées = chambre − frais de service.
test("Airbnb : le ménage n'est pas retiré du prix net", () => {
  const prix = { price: 122, commission: 22.69, invoiceItems: [{ description: "Frais de chambre", amount: 102 }, { description: "Frais de ménage", amount: 20 }] };
  const airbnb = calculerRevenusPlateforme(prix, 122, null, "Airbnb");
  assert.ok(airbnb);
  assert.equal(airbnb.prixNetNuitees, 79.31);
  assert.equal(airbnb.netSansMenage, true);
  assert.equal(calculerRevenusPlateforme(prix, 122, null, "Booking.com")?.prixNetNuitees, 59.31);
});

// Sanaa, 2026-11-05 : résa Booking.com de Keltoum Devaux (Villa Azur, 4 nuits). Booking : 4 × 378 €
// de nuitées, voyageur 1 652 €, commission 314,40 + frais de paiement 31,44. Le ménage (60 €) vient
// de la fiche ; les 80 € restants sont des taxes, pas des nuitées (l'app affichait 1 592 €).
test("Booking.com : nuitées lues dans le tarif par nuit, taxes à part", () => {
  const rateDescription = [
    "2026-10-19 (50754861 Standard Rate) EUR 378 genius",
    "2026-10-20 (50754861 Standard Rate) EUR 378 genius",
    "2026-10-21 (50754861 Standard Rate) EUR 378 genius",
    "2026-10-22 (50754861 Standard Rate) EUR 378 genius",
  ].join("\n");
  const r = calculerRevenusPlateforme({ price: 1652, commission: 345.84, rateDescription, invoiceItems: [] }, 1652, 60, "Booking.com");
  assert.ok(r);
  assert.equal(r.fraisChambre, 1512);
  assert.equal(r.origineChambre, "tarifs");
  assert.equal(r.fraisMenage, 60);
  assert.equal(r.autresFrais, 80);
  assert.equal(r.fraisServiceHote, 345.84);
  assert.equal(r.prixNetNuitees, 1106.16);
});

test("Booking.com sans tarif par nuit : la taxe Beds24 n'est pas comptée en nuitées", () => {
  const r = calculerRevenusPlateforme({ price: 1652, commission: 345.84, tax: 80, invoiceItems: [] }, 1652, 60, "Booking.com");
  assert.ok(r);
  assert.equal(r.fraisChambre, 1512);
  assert.equal(r.autresFrais, 80);
});

test("tarif par nuit : formats de montant", () => {
  assert.equal(nuiteesDeRateDescription("2026-12-24 (1 Standard) EUR 1,250.50\n2026-12-25 (1 Standard) EUR 1250,50"), 2501);
  assert.equal(nuiteesDeRateDescription("Standard Rate"), null);
  assert.equal(nuiteesDeRateDescription(null), null);
});

test("Airbnb : le tarif par nuit Beds24 est ignoré", () => {
  const r = calculerRevenusPlateforme(
    { price: 122, commission: 22.69, rateDescription: "2026-10-01 (1 Std) EUR 49.65\n2026-10-02 (1 Std) EUR 49.66", invoiceItems: [] },
    122,
    20,
    "Airbnb"
  );
  assert.ok(r);
  assert.equal(r.fraisChambre, 102);
  assert.equal(r.autresFrais, 0);
});
