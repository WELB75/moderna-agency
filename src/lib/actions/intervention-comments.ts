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

export async function getInterventionComments(interventionId: string) {
  const db = getDb();
  return db
    .select()
    .from(interventionComments)
    .where(eq(interventionComments.interventionId, interventionId))
    .orderBy(interventionComments.createdAt);
}
