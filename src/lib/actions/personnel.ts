"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations } from "@/db/schema";

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
