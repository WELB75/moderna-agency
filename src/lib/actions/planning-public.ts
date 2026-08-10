"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, cashEntries } from "@/db/schema";
import { isValidPlanningToken } from "@/lib/planning-token";

// Réaffecte une mission (ménage ou cuisine) à quelqu'un d'autre, directement depuis le lien
// public de planning — sans connexion, vérifié par jeton partagé (voir planning-token.ts). Le
// nouveau personnel doit avoir le même rôle que l'ancien : on ne mélange jamais une cuisinière
// sur une ligne de ménage ou l'inverse, même si l'appelant tente de forcer autre chose.
export async function reassignPlanningAffectation(token: string, affectationId: string, newPersonnelId: string) {
  if (!isValidPlanningToken(token)) throw new Error("Lien invalide.");

  const db = getDb();
  const [current] = await db
    .select({ role: personnel.role })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(eq(personnelAffectations.id, affectationId))
    .limit(1);
  if (!current) throw new Error("Affectation introuvable.");

  const [remplacant] = await db.select({ role: personnel.role }).from(personnel).where(eq(personnel.id, newPersonnelId)).limit(1);
  if (!remplacant) throw new Error("Personne introuvable.");
  if (remplacant.role !== current.role) throw new Error("Rôle différent — impossible d'affecter cette personne ici.");

  try {
    await db.update(personnelAffectations).set({ personnelId: newPersonnelId }).where(eq(personnelAffectations.id, affectationId));
  } catch {
    throw new Error("Cette personne est déjà affectée sur cette mission.");
  }

  revalidatePath(`/planning/${token}`);
  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

// Retire une mission (ménage ou cuisine) directement depuis le lien public — Kamel, 2026-08-09 :
// "donne nous la possibilité de supprimer aussi les femmes dans le planning direct" (ex. une
// cuisine notée par erreur le jour du départ, où il n'y a pas de petit-déj à préparer). Même
// nettoyage de la dépense de caisse liée que removePersonnelAffectation (personnel.ts) : sinon
// une dépense payée resterait fantôme, sans plus aucune affectation à laquelle la rattacher.
export async function removePlanningAffectation(token: string, affectationId: string) {
  if (!isValidPlanningToken(token)) throw new Error("Lien invalide.");

  const db = getDb();
  const [a] = await db
    .select({ cashEntryId: personnelAffectations.cashEntryId })
    .from(personnelAffectations)
    .where(eq(personnelAffectations.id, affectationId))
    .limit(1);
  if (!a) throw new Error("Affectation introuvable.");

  await db.delete(personnelAffectations).where(eq(personnelAffectations.id, affectationId));
  if (a.cashEntryId) {
    await db.delete(cashEntries).where(eq(cashEntries.id, a.cashEntryId));
  }

  revalidatePath(`/planning/${token}`);
  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
  revalidatePath("/caisse");
}

// Change le moment d'une mission de ménage (départ ⇄ pendant le séjour) depuis le lien public —
// Kamel, 2026-08-09 : "je puisse changer en déjeuner seul [...] que ça communique avec la base de
// données". Réservé au ménage : la cuisine n'a qu'un seul moment ("unique"), voir
// addPlanningAffectation.
export async function updatePlanningAffectationMoment(token: string, affectationId: string, moment: "sejour" | "depart") {
  if (!isValidPlanningToken(token)) throw new Error("Lien invalide.");

  const db = getDb();
  const [current] = await db
    .select({ role: personnel.role })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(eq(personnelAffectations.id, affectationId))
    .limit(1);
  if (!current) throw new Error("Affectation introuvable.");
  if (current.role !== "menage") throw new Error("Cette mission n'est pas une mission de ménage.");

  try {
    await db.update(personnelAffectations).set({ moment }).where(eq(personnelAffectations.id, affectationId));
  } catch {
    throw new Error("Cette personne a déjà une mission à ce moment sur ce séjour.");
  }

  revalidatePath(`/planning/${token}`);
  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

// Change la formule cuisine (petit-déj seul ⇄ petit-déj + déjeuner) depuis le lien public —
// affecte aussi le calcul du montant dû (100 vs 200 MAD/jour, voir personnelAffectations dans
// db/schema.ts). Réservé à la cuisine, symétrique de updatePlanningAffectationMoment.
export async function updatePlanningAffectationRepas(token: string, affectationId: string, avecDejeuner: boolean) {
  if (!isValidPlanningToken(token)) throw new Error("Lien invalide.");

  const db = getDb();
  const [current] = await db
    .select({ role: personnel.role })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnel.id, personnelAffectations.personnelId))
    .where(eq(personnelAffectations.id, affectationId))
    .limit(1);
  if (!current) throw new Error("Affectation introuvable.");
  if (current.role !== "cuisine") throw new Error("Cette mission n'est pas une mission de cuisine.");

  await db.update(personnelAffectations).set({ avecDejeuner }).where(eq(personnelAffectations.id, affectationId));

  revalidatePath(`/planning/${token}`);
  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

// Ajoute une nouvelle affectation (pas une réaffectation) depuis le lien public — Kamel,
// 2026-08-08 : "la possibilité de les ajouter [...] on met le nom, on met le lieu [...] et si
// c'est ménage de départ si c'est pendant le séjour si c'est petit déjeuner déjeuner etc." Le
// moment cuisine est toujours forcé à "unique" côté serveur, même si l'appelant envoie autre
// chose, pour rester cohérent avec le reste de l'app (staff.ts fait pareil).
export async function addPlanningAffectation(
  token: string,
  reservationId: string,
  personnelId: string,
  moment: "sejour" | "depart" | "unique",
  avecDejeuner: boolean
) {
  if (!isValidPlanningToken(token)) throw new Error("Lien invalide.");

  const db = getDb();
  const [resa] = await db.select({ id: reservations.id }).from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!resa) throw new Error("Réservation introuvable.");

  const [pers] = await db.select({ role: personnel.role }).from(personnel).where(eq(personnel.id, personnelId)).limit(1);
  if (!pers) throw new Error("Personne introuvable.");

  const momentValide = pers.role === "cuisine" ? "unique" : moment === "unique" ? "depart" : moment;

  try {
    await db.insert(personnelAffectations).values({
      reservationId,
      personnelId,
      moment: momentValide,
      avecDejeuner: pers.role === "cuisine" ? avecDejeuner : false,
    });
  } catch {
    throw new Error("Cette personne est déjà affectée sur cette mission.");
  }

  revalidatePath(`/planning/${token}`);
  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}
