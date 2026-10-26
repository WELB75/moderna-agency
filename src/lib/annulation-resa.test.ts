import test from "node:test";
import assert from "node:assert/strict";
import {
  annuleeLocalement,
  avertissementEncaisse,
  encaisse,
  libelleMotif,
  reservationsEnChevauchement,
  statutApresSynchro,
} from "./annulation-resa.ts";

const marqueur = { annulationLocale: { motif: "sans_nouvelles", par: "Kamel", le: "2026-10-26T09:00:00.000Z" } };

test("motifs : seuls les trois motifs proposés sont acceptés", () => {
  assert.equal(libelleMotif("annulation"), "Annulation");
  assert.equal(libelleMotif("sans_nouvelles"), "Plus de nouvelles du client");
  assert.equal(libelleMotif("erreur_saisie"), "Erreur de saisie");
  assert.equal(libelleMotif("n'importe quoi"), null);
});

test("annulation locale : reconnue par le statut ET le marqueur", () => {
  assert.equal(annuleeLocalement({ status: "annulee", rawData: marqueur }), true);
  // Annulée par la synchro (Beds24 l'a annulée) : pas un nettoyage local.
  assert.equal(annuleeLocalement({ status: "annulee", rawData: { beds24Status: "cancelled" } }), false);
  assert.equal(annuleeLocalement({ status: "confirmee", rawData: marqueur }), false);
  assert.equal(annuleeLocalement({ status: "annulee", rawData: null }), false);
});

test("synchro Beds24 : une résa annulée à la main n'est pas recréée en confirmée", () => {
  const existing = { status: "annulee", rawData: { ...marqueur, beds24Status: "confirmed" } };
  assert.equal(statutApresSynchro(existing, "confirmee"), "annulee");
  assert.equal(statutApresSynchro(existing, "annulee"), "annulee");
});

test("synchro Beds24 : comportement inchangé pour les autres réservations", () => {
  assert.equal(statutApresSynchro(undefined, "confirmee"), "confirmee");
  assert.equal(statutApresSynchro({ status: "confirmee", rawData: {} }, "annulee"), "annulee");
  // Annulée côté Beds24 puis réactivée : la synchro la remet confirmée.
  assert.equal(statutApresSynchro({ status: "annulee", rawData: { beds24Status: "cancelled" } }, "confirmee"), "confirmee");
});

test("avertissement : montant encaissé signalé, rien si rien n'est encaissé", () => {
  const f = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  assert.equal(avertissementEncaisse(encaisse({ montantPaye: 222.7 }), f), "Loyer : 222,70 € déjà encaissés");
  assert.equal(avertissementEncaisse(encaisse({ montantPaye: null, cautionRecue: 950 }), f), "Caution : 950,00 € déjà reçue");
  assert.equal(
    avertissementEncaisse(encaisse({ montantPaye: 100, cautionRecue: 950 }), f),
    "Loyer : 100,00 € déjà encaissés · Caution : 950,00 € déjà reçue"
  );
  assert.equal(avertissementEncaisse(encaisse({ montantPaye: 0, cautionRecue: null }), f), null);
  assert.equal(avertissementEncaisse(encaisse({ montantPaye: null }), f), null);
});

test("chevauchement : résa sans ID Beds24 (Nunzio 25→29) vs résa Beds24 (Pouna 26→30)", () => {
  const ids = reservationsEnChevauchement([
    { id: "nunzio", checkIn: "2026-10-25", checkOut: "2026-10-29" },
    { id: "pouna", checkIn: "2026-10-26", checkOut: "2026-10-30" },
    { id: "avant", checkIn: "2026-10-20", checkOut: "2026-10-25" },
    { id: "apres", checkIn: "2026-10-30", checkOut: "2026-11-02" },
  ]);
  assert.deepEqual([...ids].sort(), ["nunzio", "pouna"]);
});

test("chevauchement : départ et arrivée le même jour = pas de chevauchement", () => {
  assert.equal(
    reservationsEnChevauchement([
      { id: "a", checkIn: "2026-10-20", checkOut: "2026-10-25" },
      { id: "b", checkIn: "2026-10-25", checkOut: "2026-10-28" },
    ]).size,
    0
  );
});

test("chevauchement : une longue résa en recouvre plusieurs courtes", () => {
  const ids = reservationsEnChevauchement([
    { id: "longue", checkIn: "2026-10-01", checkOut: "2026-10-31" },
    { id: "c1", checkIn: "2026-10-05", checkOut: "2026-10-07" },
    { id: "c2", checkIn: "2026-10-10", checkOut: "2026-10-12" },
    { id: "libre", checkIn: "2026-11-01", checkOut: "2026-11-03" },
  ]);
  assert.deepEqual([...ids].sort(), ["c1", "c2", "longue"]);
});

test("chevauchement : une fois Nunzio annulée (retirée de la liste), plus d'alerte", () => {
  assert.equal(reservationsEnChevauchement([{ id: "pouna", checkIn: "2026-10-26", checkOut: "2026-10-30" }]).size, 0);
});
