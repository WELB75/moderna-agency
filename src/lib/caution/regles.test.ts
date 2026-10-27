import test from "node:test";
import assert from "node:assert/strict";
import { cautionDemandable, doitLeverAutomatiquement, doitRenouveler, enCentimes, formatEuros } from "./regles.ts";

const jour = (n: number) => n * 24 * 60 * 60 * 1000;
const t0 = new Date("2026-11-10T10:00:00Z");

test("enCentimes accepte nombres, textes et virgules, refuse le reste", () => {
  assert.equal(enCentimes("250.00"), 25000);
  assert.equal(enCentimes("1000"), 100000);
  assert.equal(enCentimes(950), 95000);
  assert.equal(enCentimes("12,5"), 1250);
  assert.equal(enCentimes("0"), null);
  assert.equal(enCentimes(""), null);
  assert.equal(enCentimes(null), null);
  assert.equal(enCentimes("abc"), null);
});

test("formatEuros", () => {
  assert.match(formatEuros(25000), /^250\s€$/);
  assert.match(formatEuros(1250), /^12,50\s€$/);
});

test("pas de ré-empreinte avant 5 jours", () => {
  const ok = doitRenouveler({
    statut: "autorisee",
    autoriseeAt: t0,
    depart: new Date(t0.getTime() + jour(12)),
    maintenant: new Date(t0.getTime() + jour(4)),
    vraiMaintenant: new Date(t0.getTime() + jour(4)),
  });
  assert.equal(ok, false);
});

test("ré-empreinte à 5 jours quand le séjour continue", () => {
  const ok = doitRenouveler({
    statut: "autorisee",
    autoriseeAt: t0,
    depart: new Date(t0.getTime() + jour(12)),
    maintenant: new Date(t0.getTime() + jour(5)),
    vraiMaintenant: new Date(t0.getTime() + jour(5)),
  });
  assert.equal(ok, true);
});

test("pas de ré-empreinte si le départ est dans moins d'un jour", () => {
  const ok = doitRenouveler({
    statut: "autorisee",
    autoriseeAt: t0,
    depart: new Date(t0.getTime() + jour(5.5)),
    maintenant: new Date(t0.getTime() + jour(5)),
    vraiMaintenant: new Date(t0.getTime() + jour(5)),
  });
  assert.equal(ok, false);
});

test("pas de ré-empreinte hors statut autorisée", () => {
  for (const statut of ["en_attente", "liberee", "prelevee", "expiree", "echec"] as const) {
    assert.equal(
      doitRenouveler({ statut, autoriseeAt: t0, depart: new Date(t0.getTime() + jour(20)), maintenant: new Date(t0.getTime() + jour(6)), vraiMaintenant: new Date(t0.getTime() + jour(6)) }),
      false
    );
  }
});

test("levée automatique 3 jours après le départ", () => {
  const depart = new Date("2026-11-14T11:00:00Z");
  assert.equal(doitLeverAutomatiquement({ statut: "autorisee", depart, maintenant: new Date(depart.getTime() + jour(2.9)) }), false);
  assert.equal(doitLeverAutomatiquement({ statut: "autorisee", depart, maintenant: new Date(depart.getTime() + jour(3)) }), true);
  assert.equal(doitLeverAutomatiquement({ statut: "prelevee", depart, maintenant: new Date(depart.getTime() + jour(10)) }), false);
});

test("caution demandable : jamais Airbnb, jamais annulée, plus après 7 jours de fin de séjour", () => {
  const maintenant = new Date("2026-11-10T10:00:00Z");
  const depart = new Date("2026-11-14T11:00:00Z");
  assert.deepEqual(cautionDemandable({ canal: "Booking.com", status: "confirmee", depart, maintenant }), { ok: true });
  assert.deepEqual(cautionDemandable({ canal: "Direct", status: "confirmee", depart, maintenant }), { ok: true });
  assert.deepEqual(cautionDemandable({ canal: null, status: "confirmee", depart, maintenant }), { ok: true });
  assert.deepEqual(cautionDemandable({ canal: "Airbnb", status: "confirmee", depart, maintenant }), { ok: false, raison: "airbnb" });
  assert.deepEqual(cautionDemandable({ canal: "Airbnb.com", status: "confirmee", depart, maintenant }), { ok: false, raison: "airbnb" });
  assert.deepEqual(cautionDemandable({ canal: "Direct", status: "annulee", depart, maintenant }), { ok: false, raison: "annulee" });
  assert.deepEqual(cautionDemandable({ canal: "Direct", status: "confirmee", depart: new Date(maintenant.getTime() - jour(8)), maintenant }), { ok: false, raison: "terminee" });
});
