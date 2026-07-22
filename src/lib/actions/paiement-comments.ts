"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paiementComments } from "@/db/schema";

// Volontairement sans auth.protect() : propriétaire (lien public /p/[token]) et équipe
// partagent ce fil, comme pour les échanges sur les interventions.
export async function addPaiementComment(
  paiementId: string,
  auteur: string,
  auteurType: "staff" | "proprietaire",
  message: string
) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db.insert(paiementComments).values({
    paiementId,
    auteur: auteur.trim() || (auteurType === "proprietaire" ? "Propriétaire" : "Équipe"),
    auteurType,
    message: trimmed,
  });

  revalidatePath("/proprietaires");
}

export async function updatePaiementComment(commentId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db.update(paiementComments).set({ message: trimmed }).where(eq(paiementComments.id, commentId));

  revalidatePath("/proprietaires");
}

export async function deletePaiementComment(commentId: string) {
  const db = getDb();
  await db.delete(paiementComments).where(eq(paiementComments.id, commentId));

  revalidatePath("/proprietaires");
}

export async function getPaiementComments(paiementId: string) {
  const db = getDb();
  return db
    .select()
    .from(paiementComments)
    .where(eq(paiementComments.paiementId, paiementId))
    .orderBy(paiementComments.createdAt);
}
