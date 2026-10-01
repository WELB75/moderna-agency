"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interventionComments } from "@/db/schema";

// Volontairement sans auth.protect() : utilisé aussi bien par le propriétaire (lien public,
// sans connexion) que par l'équipe. Le message reste tracé (auteur + type + horodatage).
export async function addInterventionComment(
  interventionId: string,
  auteur: string,
  auteurType: "staff" | "proprietaire",
  message: string
) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db.insert(interventionComments).values({
    interventionId,
    auteur: auteur.trim() || (auteurType === "proprietaire" ? "Propriétaire" : "Équipe"),
    auteurType,
    message: trimmed,
  });

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Volontairement sans auth.protect(), même logique que addInterventionComment ci-dessus :
// propriétaire et équipe peuvent tous les deux corriger/supprimer un message du fil. auteur/
// auteurType optionnels : permet de corriger qui a dit quoi après coup (ex. message saisi sous
// le mauvais profil par erreur), sans y toucher si seul le texte change — Kamel, 2026-10-01 :
// "dans modifier ici j'aimerais avoir aussi l'option de choisir les noms".
export async function updateInterventionComment(
  commentId: string,
  message: string,
  auteur?: string,
  auteurType?: "staff" | "proprietaire"
) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db
    .update(interventionComments)
    .set({ message: trimmed, ...(auteur ? { auteur, auteurType } : {}) })
    .where(eq(interventionComments.id, commentId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function deleteInterventionComment(commentId: string) {
  const db = getDb();
  await db.delete(interventionComments).where(eq(interventionComments.id, commentId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function getInterventionComments(interventionId: string) {
  const db = getDb();
  return db
    .select()
    .from(interventionComments)
    .where(eq(interventionComments.interventionId, interventionId))
    .orderBy(interventionComments.createdAt);
}
