"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, cashEntries, reservations, villas } from "@/db/schema";
import { montantMenageDu, montantCuisineDu } from "@/lib/personnel-tarifs";

export async function createPersonnel(formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const telephone = String(formData.get("telephone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!nom) throw new Error("Le nom est obligatoire.");
  if (role !== "menage" && role !== "cuisine") throw new Error("Rôle invalide.");

  const db = getDb();
  await db.insert(personnel).values({
    nom,
    role,
    telephone: telephone || null,
    notes: notes || null,
  });

  revalidatePath("/personnel");
}

export async function updatePersonnel(personnelId: string, formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!nom) throw new Error("Le nom est obligatoire.");

  const db = getDb();
  await db
    .update(personnel)
    .set({ nom, telephone: telephone || null, notes: notes || null })
    .where(eq(personnel.id, personnelId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

export async function togglePersonnelActif(personnelId: string, actif: boolean) {
  await auth.protect();
  const db = getDb();
  await db.update(personnel).set({ actif }).where(eq(personnel.id, personnelId));
  revalidatePath("/personnel");
}

export async function togglePersonnelEnquete(personnelId: string, enquete: boolean) {
  await auth.protect();
  const db = getDb();
  await db.update(personnel).set({ enquete }).where(eq(personnel.id, personnelId));
  revalidatePath("/personnel");
}

export async function deletePersonnel(personnelId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(personnel).where(eq(personnel.id, personnelId));
  revalidatePath("/personnel");
}

// Plusieurs personnes peuvent être affectées au même séjour (ex. 2-3 femmes de ménage
// pour une grande villa) — d'où une simple ligne ajoutée/retirée plutôt qu'un champ unique.
// `moment` distingue le ménage pendant le séjour du ménage de départ (voir schema.ts,
// personnelAffectationMomentEnum) — permet à la MÊME personne d'être affectée aux deux pour la
// même réservation. "unique" pour la cuisine, qui n'a pas cette distinction.
export async function addPersonnelAffectation(
  reservationId: string,
  personnelId: string,
  moment: "sejour" | "depart" | "unique" = "unique"
) {
  await auth.protect();
  const db = getDb();
  await db
    .insert(personnelAffectations)
    .values({ reservationId, personnelId, moment })
    .onConflictDoNothing();

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

export async function removePersonnelAffectation(affectationId: string) {
  await auth.protect();
  const db = getDb();

  // Si l'affectation était payée via markAffectationPaidSolo, sa dépense de caisse doit partir
  // avec elle — sinon la suppression laisse une dépense fantôme, sans plus aucune affectation à
  // laquelle la rattacher. Kamel, 2026-08-06 : "tout modifier depuis ici".
  const [a] = await db.select({ cashEntryId: personnelAffectations.cashEntryId }).from(personnelAffectations).where(eq(personnelAffectations.id, affectationId)).limit(1);

  await db.delete(personnelAffectations).where(eq(personnelAffectations.id, affectationId));
  if (a?.cashEntryId) {
    await db.delete(cashEntries).where(eq(cashEntries.id, a.cashEntryId));
  }

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
}

// Ménage : confirme (ou annule) que le ménage a réellement été fait, distinct du simple fait
// d'avoir été affectée — sert de preuve fiable pour les statistiques.
export async function toggleAffectationFait(affectationId: string, fait: boolean) {
  await auth.protect();
  const db = getDb();
  await db
    .update(personnelAffectations)
    .set({ faitAt: fait ? new Date() : null })
    .where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

// Cuisine : nombre de jours si elle n'a pas couvert tout le séjour.
export async function updateAffectationJours(affectationId: string, nbJours: number | null) {
  await auth.protect();
  const db = getDb();
  await db.update(personnelAffectations).set({ nbJours }).where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

// Cuisine : 100 MAD/jour si petit-déjeuner seul, 200 MAD/jour si elle fait aussi le déjeuner.
export async function updateAffectationAvecDejeuner(affectationId: string, avecDejeuner: boolean) {
  await auth.protect();
  const db = getDb();
  await db.update(personnelAffectations).set({ avecDejeuner }).where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

// Remarque libre sur une affectation (ex. correction, particularité) — éditable à tout moment,
// payée ou non. Kamel, 2026-08-06 : "d'ajouter des notes".
export async function updateAffectationCommentaire(affectationId: string, commentaire: string | null) {
  await auth.protect();
  const db = getDb();
  await db
    .update(personnelAffectations)
    .set({ commentaire: commentaire?.trim() || null })
    .where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

// Marque payée une seule affectation directement depuis sa carte (cercle cliquable, comme le
// "fait" du ménage) plutôt que de devoir passer par l'onglet Paiements — le montant réel est
// recalculé côté serveur (pas celui affiché en aperçu côté client) et ajouté à la caisse.
// Retourne un résultat plutôt que de lever une exception pour les cas prévisibles ("rien à payer
// avant le check-out") : un throw ici plantait toute la page (écran rouge Next.js) au lieu de
// simplement afficher un toast d'erreur — repéré en prod par Kamel (2026-08-06), le check-out
// n'ayant pas encore eu lieu pour la réservation concernée.
export async function markAffectationPaidSolo(affectationId: string): Promise<{ ok: boolean; message?: string }> {
  await auth.protect();
  const db = getDb();

  const [a] = await db.select().from(personnelAffectations).where(eq(personnelAffectations.id, affectationId)).limit(1);
  if (!a) return { ok: false, message: "Affectation introuvable." };
  if (a.payeAt) return { ok: true };

  const [p] = await db.select().from(personnel).where(eq(personnel.id, a.personnelId)).limit(1);
  if (!p) return { ok: false, message: "Personne introuvable." };

  const [r] = await db
    .select({
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      checkoutValideAt: reservations.checkoutValideAt,
      villaId: reservations.villaId,
    })
    .from(reservations)
    .where(eq(reservations.id, a.reservationId))
    .limit(1);
  if (!r) return { ok: false, message: "Réservation introuvable." };

  const montant =
    p.role === "menage"
      ? montantMenageDu(a.faitAt, a.nbJours)
      : montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner);
  if (montant <= 0) {
    return { ok: false, message: "Rien à payer pour l'instant (check-out pas encore validé, ou ménage pas confirmé fait)." };
  }

  const villa = r.villaId ? (await db.select({ nom: villas.nom, numero: villas.numero }).from(villas).where(eq(villas.id, r.villaId)).limit(1))[0] : null;
  const user = await currentUser();

  const roleLabel = p.role === "menage" ? "ménage" : "cuisine";
  const [entry] = await db
    .insert(cashEntries)
    .values({
      villaId: r.villaId,
      type: "depense",
      moyenPaiement: "especes",
      montant: montant.toFixed(2),
      reservationId: a.reservationId,
      description: `Paiement ${roleLabel} — ${p.nom}${villa ? ` (${villa.nom} n°${villa.numero})` : ""}`,
      responsable: p.nom,
      photoUrls: [],
      createdByUserId: user?.id ?? "inconnu",
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning({ id: cashEntries.id });

  // cashEntryId retenu pour pouvoir annuler proprement cette dépense précise si le statut payée
  // est réactivé plus tard (voir unmarkAffectationPaid) — sans ça, un aller-retour payée/non payée
  // laisserait une dépense fantôme dans la caisse.
  await db.update(personnelAffectations).set({ payeAt: new Date(), cashEntryId: entry.id }).where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
  return { ok: true };
}

// Réactive une affectation marquée payée par erreur (ou à corriger) — Kamel, 2026-08-06 :
// "réactivé tout le bloc, faire un ON OFF". Supprime la dépense de caisse liée pour ne pas
// laisser une trace fantôme (seulement celle créée par markAffectationPaidSolo — le flux groupé
// markAffectationsPaid n'est pas concerné, une dépense y couvre plusieurs affectations à la fois).
export async function unmarkAffectationPaid(affectationId: string): Promise<{ ok: boolean; message?: string }> {
  await auth.protect();
  const db = getDb();

  const [a] = await db.select().from(personnelAffectations).where(eq(personnelAffectations.id, affectationId)).limit(1);
  if (!a) return { ok: false, message: "Affectation introuvable." };
  if (!a.payeAt) return { ok: true };

  await db.update(personnelAffectations).set({ payeAt: null, cashEntryId: null }).where(eq(personnelAffectations.id, affectationId));
  if (a.cashEntryId) {
    await db.delete(cashEntries).where(eq(cashEntries.id, a.cashEntryId));
  }

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
  return { ok: true };
}

// Note du client (1 à 5) donnée en réponse au message de départ, saisie à la main par l'équipe
// (ce message part du téléphone personnel de l'équipe, pas du numéro du bot — la réponse du
// client n'arrive donc pas automatiquement dans le système, sauf s'il écrit directement au
// numéro de l'agent). Appliquée à toute l'équipe (ménage + cuisine) de ce séjour, comme lorsque
// l'agent IA la capte lui-même (voir rating.ts, recordStayRating).
export async function setStayRating(reservationId: string, note: number) {
  await auth.protect();
  if (!Number.isInteger(note) || note < 1 || note > 5) throw new Error("Note invalide (doit être entre 1 et 5).");
  const db = getDb();
  await db.update(personnelAffectations).set({ note }).where(eq(personnelAffectations.reservationId, reservationId));
  revalidatePath("/personnel");
  revalidatePath("/dashboard");
}

// Marque payées d'un coup toutes les affectations dues et pas encore payées d'une personne —
// évite de devoir cocher chaque ménage/jour de cuisine un par un après un paiement en liquide.
// Ajoute aussi la dépense correspondante dans la caisse (payée en liquide) avec le nom de la
// personne payée, pour ne pas avoir à la ressaisir manuellement après coup.
export async function markAffectationsPaid(
  affectationIds: string[],
  personnelNom: string,
  role: "menage" | "cuisine",
  details: { villaId: string | null; villaNom: string | null; villaNumero: string | null; montant: number }[],
) {
  await auth.protect();
  if (affectationIds.length === 0) return;
  const user = await currentUser();
  const db = getDb();
  await db
    .update(personnelAffectations)
    .set({ payeAt: new Date() })
    .where(inArray(personnelAffectations.id, affectationIds));

  // Une dépense de caisse est rattachée à une seule réservation (donc un seul client) : on
  // regroupe par réservation plutôt que par villa, sinon deux séjours différents dans la même
  // villa se retrouveraient fusionnés sous une seule dépense sans client identifiable.
  const affectationRows = await db
    .select({ id: personnelAffectations.id, reservationId: personnelAffectations.reservationId })
    .from(personnelAffectations)
    .where(inArray(personnelAffectations.id, affectationIds));
  const reservationIdByAffectationId = new Map(affectationRows.map((a) => [a.id, a.reservationId]));

  const parReservation = new Map<
    string,
    { reservationId: string; villaId: string | null; villaNom: string | null; villaNumero: string | null; montant: number }
  >();
  details.forEach((d, i) => {
    const reservationId = reservationIdByAffectationId.get(affectationIds[i]);
    if (!reservationId) return;
    const existante = parReservation.get(reservationId);
    if (existante) existante.montant += d.montant;
    else parReservation.set(reservationId, { reservationId, villaId: d.villaId, villaNom: d.villaNom, villaNumero: d.villaNumero, montant: d.montant });
  });

  const roleLabel = role === "menage" ? "ménage" : "cuisine";
  for (const { reservationId, villaId, villaNom, villaNumero, montant } of parReservation.values()) {
    if (montant <= 0) continue;
    await db.insert(cashEntries).values({
      villaId,
      reservationId,
      type: "depense",
      moyenPaiement: "especes",
      montant: montant.toFixed(2),
      description: `Paiement ${roleLabel} — ${personnelNom}${villaNom ? ` (${villaNom} n°${villaNumero})` : ""}`,
      responsable: personnelNom,
      photoUrls: [],
      createdByUserId: user?.id ?? "inconnu",
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    });
  }

  revalidatePath("/personnel");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
}
