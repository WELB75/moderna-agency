"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, cashEntries, reservations, villas, domaines } from "@/db/schema";
import { montantMenageDu, montantCuisineDu } from "@/lib/personnel-tarifs";
import { finTravailleSiPartagee } from "@/lib/planning-jours-affectation";
import { nowInMorocco } from "@/lib/now";
import { notifyBrahimForReservation } from "@/lib/whatsapp-agent/brahim";
import { tracer } from "@/lib/journal";

async function nomPersonnel(personnelId: string): Promise<string | null> {
  const [p] = await getDb().select({ nom: personnel.nom }).from(personnel).where(eq(personnel.id, personnelId)).limit(1);
  return p?.nom ?? null;
}

// Qui / quelle mission / quelle villa pour une affectation, afin que le journal soit lisible.
async function decrireAffectation(affectationId: string) {
  const [r] = await getDb()
    .select({
      personneNom: personnel.nom,
      role: personnel.role,
      moment: personnelAffectations.moment,
      reservationId: personnelAffectations.reservationId,
      guestName: reservations.guestName,
      villaId: reservations.villaId,
      villaNom: villas.nom,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .leftJoin(reservations, eq(reservations.id, personnelAffectations.reservationId))
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .where(eq(personnelAffectations.id, affectationId))
    .limit(1);
  if (!r) return null;
  const mission = r.role === "cuisine" ? "cuisine" : r.moment === "depart" ? "ménage départ" : "ménage séjour";
  const resume = `${r.personneNom} - ${mission}${r.villaNom ? ` - ${r.villaNom}` : ""}${r.guestName ? ` (${r.guestName})` : ""}`;
  return { resume, villaId: r.villaId, villaNom: r.villaNom, reservationId: r.reservationId };
}

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
  await tracer({ categorie: "personnel", action: "personnel_cree", libelle: "Personnel ajouté", resume: `${nom} (${role === "menage" ? "ménage" : "cuisine"})` });

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
  await tracer({ categorie: "personnel", action: "personnel_modifie", libelle: "Personnel modifié", resume: nom });

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

export async function togglePersonnelActif(personnelId: string, actif: boolean) {
  await auth.protect();
  const db = getDb();
  await db.update(personnel).set({ actif }).where(eq(personnel.id, personnelId));
  await tracer({ categorie: "personnel", action: actif ? "personnel_active" : "personnel_desactive", libelle: actif ? "Personnel activé" : "Personnel désactivé", resume: await nomPersonnel(personnelId) });
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
  const nom = await nomPersonnel(personnelId);
  await db.delete(personnel).where(eq(personnel.id, personnelId));
  await tracer({ categorie: "personnel", action: "personnel_supprime", libelle: "Personnel supprimé", resume: nom });
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
  const [created] = await db
    .insert(personnelAffectations)
    .values({ reservationId, personnelId, moment })
    .onConflictDoNothing()
    .returning({ id: personnelAffectations.id });
  if (created) {
    const d = await decrireAffectation(created.id);
    await tracer({ categorie: "personnel", action: "affectation_ajoutee", libelle: "Personnel affecté à un séjour", resume: d?.resume, villaId: d?.villaId, villaNom: d?.villaNom, reservationId });
  }

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");

  // Peut être absent si onConflictDoNothing a bloqué l'insertion (déjà affecté) — l'appelant ne
  // s'en sert que pour un miroir client (assistant de réservation), jamais critique.
  return { id: created?.id ?? null };
}

// Bouton "Prévenir Brahim" sur la ligne d'affectation ménage/départ — en plus du cron quotidien
// (voir src/lib/whatsapp-agent/brahim.ts), pour renvoyer à la demande. Kamel, 2026-09-18 : bouton
// manuel voulu en plus du cron automatique, pas à sa place.
export async function sendBrahimCoursesReminder(reservationId: string): Promise<{ sent: boolean; villa: string | null }> {
  await auth.protect();
  return notifyBrahimForReservation(reservationId);
}

export async function removePersonnelAffectation(affectationId: string) {
  await auth.protect();
  const db = getDb();

  // Si l'affectation était payée via markAffectationPaidSolo, sa dépense de caisse doit partir
  // avec elle — sinon la suppression laisse une dépense fantôme, sans plus aucune affectation à
  // laquelle la rattacher. Kamel, 2026-08-06 : "tout modifier depuis ici".
  const [a] = await db.select({ cashEntryId: personnelAffectations.cashEntryId }).from(personnelAffectations).where(eq(personnelAffectations.id, affectationId)).limit(1);
  const d = await decrireAffectation(affectationId);

  await db.delete(personnelAffectations).where(eq(personnelAffectations.id, affectationId));
  if (a?.cashEntryId) {
    await db.delete(cashEntries).where(eq(cashEntries.id, a.cashEntryId));
  }
  await tracer({ categorie: "personnel", action: "affectation_retiree", libelle: "Affectation retirée", resume: d?.resume, villaId: d?.villaId, villaNom: d?.villaNom, reservationId: d?.reservationId });

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
  const d = await decrireAffectation(affectationId);
  await tracer({ categorie: "personnel", action: fait ? "menage_fait" : "menage_fait_annule", libelle: fait ? "Ménage confirmé fait" : "Confirmation du ménage annulée", resume: d?.resume, villaId: d?.villaId, villaNom: d?.villaNom, reservationId: d?.reservationId });

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

// Cuisine : nombre de jours si elle n'a pas couvert tout le séjour.
export async function updateAffectationJours(affectationId: string, nbJours: number | null) {
  await auth.protect();
  const db = getDb();
  await db.update(personnelAffectations).set({ nbJours }).where(eq(personnelAffectations.id, affectationId));
  const d = await decrireAffectation(affectationId);
  await tracer({ categorie: "personnel", action: "affectation_jours", libelle: "Nombre de jours de cuisine modifié", resume: `${d?.resume ?? ""} : ${nbJours ?? "tout le séjour"}`, villaId: d?.villaId, villaNom: d?.villaNom, reservationId: d?.reservationId });

  revalidatePath("/personnel");
  revalidatePath("/villas");
}

// Cuisine : 100 MAD/jour si petit-déjeuner seul, 200 MAD/jour si elle fait aussi le déjeuner.
export async function updateAffectationAvecDejeuner(affectationId: string, avecDejeuner: boolean) {
  await auth.protect();
  const db = getDb();
  await db.update(personnelAffectations).set({ avecDejeuner }).where(eq(personnelAffectations.id, affectationId));
  const d = await decrireAffectation(affectationId);
  await tracer({ categorie: "personnel", action: "affectation_repas", libelle: "Formule cuisine modifiée", resume: `${d?.resume ?? ""} : ${avecDejeuner ? "petit-déjeuner + déjeuner" : "petit-déjeuner seul"}`, villaId: d?.villaId, villaNom: d?.villaNom, reservationId: d?.reservationId });

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

// Note qualité (1 à 5) donnée par l'équipe sur le travail réellement constaté d'une affectation
// (propreté du ménage de départ, qualité de la cuisine) — distincte de setStayRating ci-dessous
// qui note le CLIENT, pas le personnel. Sert à calculer une moyenne long terme par personne
// (voir RosterSection, personnel/page.tsx). null retire la note (erreur de saisie).
export async function setAffectationQualiteNote(affectationId: string, note: number | null) {
  await auth.protect();
  if (note !== null && (!Number.isInteger(note) || note < 1 || note > 5)) {
    throw new Error("Note invalide (doit être entre 1 et 5).");
  }
  const db = getDb();
  await db.update(personnelAffectations).set({ qualiteNote: note }).where(eq(personnelAffectations.id, affectationId));

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
      villaNbChambres: villas.nbChambres,
      domaineNom: domaines.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservations.id, a.reservationId))
    .limit(1);
  if (!r) return { ok: false, message: "Réservation introuvable." };

  let montant: number;
  if (p.role === "menage") {
    montant = montantMenageDu(a.faitAt, a.nbJours, { domaineNom: r.domaineNom, nbChambres: r.villaNbChambres });
  } else {
    // Sa propre date de fin SI elle partage les jours de cette réservation avec quelqu'un
    // d'autre (voir montantCuisineDu) — permet de la payer dès sa part terminée, sans attendre
    // le check-out de tout le séjour. Kamel, 2026-08-28 : "khadija a fait qu'un jour donc je
    // l'ai deja payer".
    const memeGroupe = (
      await db
        .select({ id: personnelAffectations.id, personnelId: personnelAffectations.personnelId, moment: personnelAffectations.moment, nbJours: personnelAffectations.nbJours, createdAt: personnelAffectations.createdAt })
        .from(personnelAffectations)
        .where(eq(personnelAffectations.reservationId, a.reservationId))
    ).filter((s) => s.moment === a.moment);
    const memeGroupePersonnelIds = [...new Set(memeGroupe.map((s) => s.personnelId))];
    const memeGroupePersonnel =
      memeGroupePersonnelIds.length > 0
        ? await db.select({ id: personnel.id, role: personnel.role }).from(personnel).where(inArray(personnel.id, memeGroupePersonnelIds))
        : [];
    const roleParPersonnelId = new Map(memeGroupePersonnel.map((mp) => [mp.id, mp.role]));
    const memeGroupeCuisine = memeGroupe
      .filter((s) => (roleParPersonnelId.get(s.personnelId) ?? "menage") === "cuisine")
      .map((s) => ({ id: s.id, reservationId: a.reservationId, role: "cuisine" as const, moment: s.moment, nbJours: s.nbJours, createdAt: s.createdAt }));
    const finTravaillePersonne = finTravailleSiPartagee(memeGroupeCuisine, a.id, new Date(r.checkIn), new Date(r.checkOut));
    montant = montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner, finTravaillePersonne, nowInMorocco());
  }
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
  await tracer({ categorie: "paiement", action: "personnel_paye", libelle: "Personnel payé", resume: `${p.nom} - ${roleLabel} : ${montant} MAD${villa ? ` (${villa.nom})` : ""}`, villaId: r.villaId, villaNom: villa?.nom, reservationId: a.reservationId });

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

  const d = await decrireAffectation(affectationId);
  await db.update(personnelAffectations).set({ payeAt: null, cashEntryId: null }).where(eq(personnelAffectations.id, affectationId));
  if (a.cashEntryId) {
    await db.delete(cashEntries).where(eq(cashEntries.id, a.cashEntryId));
  }
  await tracer({ categorie: "paiement", action: "personnel_paiement_annule", libelle: "Paiement du personnel annulé", resume: d?.resume, villaId: d?.villaId, villaNom: d?.villaNom, reservationId: a.reservationId });

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
  const total = details.reduce((somme, d) => somme + d.montant, 0);
  await tracer({
    categorie: "paiement",
    action: "personnel_paye",
    libelle: "Personnel payé",
    resume: `${personnelNom} - ${role === "menage" ? "ménage" : "cuisine"} : ${total} MAD (${affectationIds.length} mission${affectationIds.length > 1 ? "s" : ""})`,
  });

  revalidatePath("/personnel");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
}
