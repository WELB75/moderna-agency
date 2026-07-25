"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations, cashEntries } from "@/db/schema";

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

export async function deletePersonnel(personnelId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(personnel).where(eq(personnel.id, personnelId));
  revalidatePath("/personnel");
}

// Plusieurs personnes peuvent être affectées au même séjour (ex. 2-3 femmes de ménage
// pour une grande villa) — d'où une simple ligne ajoutée/retirée plutôt qu'un champ unique.
export async function addPersonnelAffectation(reservationId: string, personnelId: string) {
  await auth.protect();
  const db = getDb();
  await db
    .insert(personnelAffectations)
    .values({ reservationId, personnelId })
    .onConflictDoNothing();

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

export async function removePersonnelAffectation(affectationId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(personnelAffectations).where(eq(personnelAffectations.id, affectationId));

  revalidatePath("/personnel");
  revalidatePath("/villas");
  revalidatePath("/dashboard");
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

  // Une dépense de caisse est rattachée à une seule villa : on regroupe donc le montant par
  // villa (le cas courant reste une seule villa par paiement).
  const parVilla = new Map<string, { villaId: string | null; villaNom: string | null; villaNumero: string | null; montant: number }>();
  for (const d of details) {
    const cle = d.villaId ?? "aucune";
    const existante = parVilla.get(cle);
    if (existante) existante.montant += d.montant;
    else parVilla.set(cle, { ...d });
  }

  const roleLabel = role === "menage" ? "ménage" : "cuisine";
  for (const { villaId, villaNom, villaNumero, montant } of parVilla.values()) {
    if (montant <= 0) continue;
    await db.insert(cashEntries).values({
      villaId,
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
