import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserAvisAirbnb, normaliserAvisBooking } from "./normaliser.ts";
import { aTraiter, moyenne, parLogement, repartition, resumer, type AvisStat } from "./stats.ts";

test("Airbnb : note sur 5 ramenée sur 10, catégories et réponse", () => {
  const a = normaliserAvisAirbnb({
    id: "a1",
    overall_rating: 5,
    public_review: " Superbe villa ",
    private_feedback: "RAS",
    category_ratings: [{ category: "cleanliness", rating: 5 }, { category: "value", rating: 4 }],
    reviewee_response: "Merci !",
    responded_at: "2026-10-02T10:00:00Z",
    submitted_at: "2026-10-01T09:00:00Z",
    reviewer_role: "guest",
  });
  assert.equal(a?.note10, 10);
  assert.equal(a?.texte, "Superbe villa");
  assert.deepEqual(a?.detail, [{ cle: "proprete", note10: 10 }, { cle: "qualite_prix", note10: 8 }]);
  assert.equal(a?.reponse, "Merci !");
  assert.equal(a?.retourPrive, "RAS");
});

test("Airbnb : avis écrit par l'hôte ou sans note ignoré", () => {
  assert.equal(normaliserAvisAirbnb({ id: "x", overall_rating: 5, reviewer_role: "host" }), null);
  assert.equal(normaliserAvisAirbnb({ id: "x" }), null);
  assert.equal(normaliserAvisAirbnb({ overall_rating: 4 }), null);
});

test("Booking : note sur 10, positif + négatif, pays et réservation", () => {
  const b = normaliserAvisBooking({
    review_id: 77,
    created_timestamp: "2026-10-13 12:16:33",
    content: { headline: "Top", positive: "Piscine", negative: "Wifi lent", language_code: "fr" },
    reservation_id: 5551234,
    scoring: { review_score: 8.5, clean: 10, staff: 7.5, value: null },
    reviewer: { name: "Jean", country_code: "fr" },
    reply: { text: "Merci" },
  });
  assert.equal(b?.note10, 8.5);
  assert.equal(b?.texte, "Piscine\n\nWifi lent");
  assert.equal(b?.pays, "FR");
  assert.equal(b?.reservationRef, "5551234");
  assert.equal(b?.publieAt?.toISOString(), "2026-10-13T12:16:33.000Z");
  assert.deepEqual(b?.detail, [{ cle: "proprete", note10: 10 }, { cle: "communication", note10: 7.5 }]);
});

const avis = (over: Partial<AvisStat>): AvisStat => ({ source: "airbnb", note10: 10, villaId: "v1", publieAt: new Date("2026-11-01T00:00:00Z"), reponse: null, masque: false, detail: [], ...over });

test("note unifiée pondérée par le nombre d'avis, masqués exclus", () => {
  const r = resumer([avis({ note10: 10 }), avis({ source: "booking", note10: 8 }), avis({ source: "booking", note10: 9 }), avis({ note10: 2, masque: true })]);
  assert.equal(r.n, 3);
  assert.equal(r.moyenne10, 9);
  assert.equal(r.airbnb.moyenne5, 5);
  assert.equal(r.booking.moyenne10, 8.5);
  assert.equal(moyenne([]), null);
});

test("répartition par étoiles", () => {
  const rep = repartition([avis({ note10: 10 }), avis({ note10: 9 }), avis({ note10: 6 }), avis({ note10: 2 })]);
  assert.deepEqual(rep.map((x) => x.n), [2, 0, 1, 0, 1]);
});

test("tendance : 90 derniers jours contre les 90 d'avant", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const j = (d: number) => new Date(now.getTime() - d * 86400000);
  const [l] = parLogement([avis({ note10: 10, publieAt: j(10) }), avis({ note10: 8, publieAt: j(120) })], [{ id: "v1", nom: "Lila", type: "villa", domaine: null }], now);
  assert.equal(l.tendance, 2);
});

test("à traiter : mauvaise note récente, sans réponse depuis plus de 48 h", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const j = (d: number) => new Date(now.getTime() - d * 86400000);
  const r = aTraiter([avis({ note10: 4, publieAt: j(3) }), avis({ note10: 9, publieAt: j(1) }), avis({ note10: 9, publieAt: j(5), reponse: "ok" })], now);
  assert.equal(r.bas.length, 1);
  assert.equal(r.sansReponse.length, 1);
});
