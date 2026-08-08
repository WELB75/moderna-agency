"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { personnel, personnelAffectations } from "@/db/schema";
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
