"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interventionComments } from "@/db/schema";
import { tracer } from "@/lib/journal";

// Volontairement sans auth.protect() : utilisé aussi bien par le propriétaire (lien public,
// sans connexion) que par l'équipe. Le message reste tracé (auteur + type + horodatage).
export async function addInterventionComment(
  interventionId: string,
  auteur: string,
  auteurType: "staff" | "proprietaire",
  message: string,
  attachmentUrls: string[] = []
) {
  const trimmed = message.trim();
  if (!trimmed && attachmentUrls.length === 0) throw new Error("Le message est vide.");

  const db = getDb();
  await db.insert(interventionComments).values({
    interventionId,
    auteur: auteur.trim() || (auteurType === "proprietaire" ? "Propriétaire" : "Équipe"),
    auteurType,
    message: trimmed || "Pièce jointe",
    attachmentUrls,
  });

  await tracer({
    categorie: "maintenance",
    action: "commentaire_intervention_ajoute",
    libelle: "Commentaire ajouté sur une intervention",
    resume: `${auteur.trim() || (auteurType === "proprietaire" ? "Propriétaire" : "Équipe")} : ${(trimmed || "Pièce jointe").slice(0, 120)}`,
    ...(auteurType === "proprietaire" ? { auteur: { type: "humain" as const, id: null, nom: "Propriétaire (lien)", email: null } } : {}),
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
  const [avant] = await db
    .select({ auteur: interventionComments.auteur, message: interventionComments.message })
    .from(interventionComments)
    .where(eq(interventionComments.id, commentId))
    .limit(1);
  await db.delete(interventionComments).where(eq(interventionComments.id, commentId));
  await tracer({
    categorie: "maintenance",
    action: "commentaire_intervention_supprime",
    libelle: "Commentaire d'intervention supprimé",
    resume: avant ? `${avant.auteur} : ${avant.message.slice(0, 120)}` : null,
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
