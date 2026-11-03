import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerRevenusPlateforme, estCanalPlateforme, prixBeds24DeRawData } from "./revenus-plateforme.ts";

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
