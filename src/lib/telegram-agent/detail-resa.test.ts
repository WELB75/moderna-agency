import { test } from "node:test";
import assert from "node:assert/strict";
import { logementTexte, montantTexte, nombreDeNuits, revenusTexte } from "../revenus-plateforme.ts";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("montants à la française, sans espace insécable", () => {
  assert.equal(montantTexte(3695.56), "3 695,56 €");
  assert.equal(montantTexte(80), "80 €");
  assert.equal(montantTexte(1200, "MAD"), "1 200 MAD");
});

test("nombre de nuits", () => assert.equal(nombreDeNuits(d("2026-06-24"), d("2026-06-29")), 5));

// Écran Airbnb de Kamel : 5 nuits 4 460, ménage 80, frais de service 844,44, total 3 695,56.
test("Airbnb : chambre + ménage - frais de service = total, nuits en moyenne", () => {
  const t = revenusTexte({
    rawData: { beds24Prix: { price: 4540, commission: 844.44, invoiceItems: [{ type: "charge", description: "[ROOMNAME1] [FIRSTNIGHT] - [LEAVINGDAY]", qty: 1, amount: 3695.56, lineTotal: 3695.56 }], rateDescription: "Base Price 4460 EUR\nCleaning fee 80.00 EUR\nHost Fee -844.44 EUR\n" } },
    loyerTotal: "4540.00", fraisMenage: "80.00", canal: "Airbnb", devise: "EUR", checkIn: d("2026-06-24"), checkOut: d("2026-06-29"),
  });
  assert.equal(t, "Airbnb : Chambre 4 460 € (5 nuits, moy. 892 €/nuit) + ménage 80 € - frais de service hôte 844,44 € = 3 695,56 €");
});

test("Booking.com : tarifs réels par nuit, ménage, taxes, commission", () => {
  const nuits = Array.from({ length: 4 }, (_, i) => `2026-10-${19 + i} (50754861 Standard Rate) EUR 378 genius`).join("\n");
  const t = revenusTexte({
    rawData: { beds24Prix: { price: 1652, commission: 150, tax: 80, rateDescription: nuits, invoiceItems: [] } },
    loyerTotal: "1652.00", fraisMenage: "60.00", canal: "Booking.com", devise: "EUR", checkIn: d("2026-10-19"), checkOut: d("2026-10-23"),
  });
  assert.equal(t, "Booking.com : Chambre 1 512 € (4 nuits à 378 €) + ménage 60 € + taxes et autres frais 80 € - frais de service hôte 150 € = 1 502 €");
});

test("réservation directe ou sans donnée : rien", () => {
  assert.equal(revenusTexte({ rawData: null, loyerTotal: "500", fraisMenage: null, canal: "Direct", devise: "EUR", checkIn: d("2026-01-01"), checkOut: d("2026-01-03") }), null);
  assert.equal(revenusTexte({ rawData: null, loyerTotal: null, fraisMenage: null, canal: "Airbnb", devise: "EUR", checkIn: d("2026-01-01"), checkOut: d("2026-01-03") }), null);
});

test("logement : appartement avec immeuble, adresse et chambres", () => {
  assert.equal(logementTexte({ type: "appartement", adresse: "12 rue  Yasmine", numeroImmeuble: "4", nbChambres: 2 }), "Appartement - immeuble 4 - 12 rue Yasmine - 2 chambres");
  assert.equal(logementTexte({ type: "villa", adresse: null, numeroImmeuble: null, nbChambres: null }), null);
});
