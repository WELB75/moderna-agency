import { test } from "node:test";
import assert from "node:assert/strict";
import { convertirDetailNote, lireDetailNote } from "./compta-note.ts";

test("500dh/nuit, total, ménage, total général", () => {
  const d = lireDetailNote("500dh/ nuitée *total: 1000dh* frais de ménage de fin de séjour: 200dh. total 1200dh la cliente a payé la totalité en espèce", 2);
  assert.ok(d);
  assert.equal(d.devise, "MAD");
  assert.equal(d.location, 1000);
  assert.equal(d.menage, 200);
  assert.equal(d.total, 1200);
});

test("700dh/nuit pour 3 nuits, total des nuitées, ménage", () => {
  const d = lireDetailNote("700dh/ nuit pour 3nuits. *total des nuitées: 2100dh* frais de ménage: 250dh Total de séjour: 2350dh", 3);
  assert.ok(d);
  assert.equal(d.location, 2100);
  assert.equal(d.menage, 250);
});

test("83€/nuit + 25€ ménage, total à récupérer en euros", () => {
  const d = lireDetailNote("83€/ nuit + 25€ frais de ménage Total à récupérer 108€ = 1150dh la cliente a payé en espèce", 1);
  assert.ok(d);
  assert.equal(d.devise, "EUR");
  assert.equal(d.location, 83);
  assert.equal(d.menage, 25);
});

test("règlement seul, acompte, propriétaire : rien repris", () => {
  assert.equal(lireDetailNote("La cliente à payer 900dh en espèce", 2), null);
  assert.equal(lireDetailNote("ami du propriétaire, il a payé que les 25€ de ménage au propriétaire.", 1), null);
  assert.equal(lireDetailNote("Le client va versé un acompte de 2385€ au propriétaire + 24 200 MAD + la piscine chauffée 1500 MAD", 5), null);
  assert.equal(lireDetailNote("Lit bébé, piscine chauffée", 2), null);
});

test("total incohérent : rien repris", () => {
  assert.equal(lireDetailNote("500dh/ nuitée total: 1000dh ménage 200dh total 1500dh", 2), null);
});

test("prolongation d'une nuit", () => {
  const d = lireDetailNote("la cliente a prolongé 1 nuitée à 650dh, elle a payé en espèce moderna", 1);
  assert.ok(d);
  assert.equal(d.location, 650);
});

test("conversion : ramenée au loyer enregistré", () => {
  const d = lireDetailNote("500dh/ nuitée *total: 1000dh* frais de ménage de fin de séjour: 200dh. total 1200dh", 2)!;
  const c = convertirDetailNote(d, 120, (m) => m / 10.8);
  assert.equal(c.location + c.menage, 120);
  assert.equal(c.menage, 20);
});

test("même poste avec deux montants : ambigu, rien repris", () => {
  assert.equal(lireDetailNote("Devis : 3900 DH x 2 nuits = 7800 DH + 600 DH ménage de fin de séjour = 8400 DH au total", 2), null);
});
