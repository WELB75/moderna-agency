"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paiementComments, paiementsProprietaire, villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

// Ligne de paiement + villa, pour le résumé du journal.
async function infoPaiement(paiementId: string) {
  const [p] = await getDb()
    .select({ titre: paiementsProprietaire.titre, villaId: paiementsProprietaire.villaId, villaNom: villas.nom })
    .from(paiementsProprietaire)
    .leftJoin(villas, eq(villas.id, paiementsProprietaire.villaId))
    .where(eq(paiementsProprietaire.id, paiementId))
    .limit(1);
  return { titre: p?.titre ?? null, villaId: p?.villaId ?? null, villaNom: p?.villaNom ?? null };
}

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

  const info = await infoPaiement(paiementId);
  const nom = auteur.trim() || (auteurType === "proprietaire" ? "Propriétaire" : "Équipe");
  await tracer({
    categorie: "paiement",
    action: "paiement_commentaire_ajoute",
    libelle: auteurType === "proprietaire" ? "Commentaire du propriétaire sur un paiement" : "Commentaire ajouté sur un paiement",
    resume: info.titre,
    villaId: info.villaId,
    villaNom: info.villaNom,
    // Le propriétaire n'a pas de compte Clerk (lien public) : auteur explicite.
    auteur: auteurType === "proprietaire" ? { type: "humain", id: null, nom: `${nom} (propriétaire)`, email: null } : undefined,
  });

  revalidatePath("/proprietaires");
}

export async function updatePaiementComment(commentId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db.update(paiementComments).set({ message: trimmed }).where(eq(paiementComments.id, commentId));
  await tracer({ categorie: "paiement", action: "paiement_commentaire_modifie", libelle: "Commentaire de paiement modifié" });

  revalidatePath("/proprietaires");
}

export async function deletePaiementComment(commentId: string) {
  const db = getDb();
  await db.delete(paiementComments).where(eq(paiementComments.id, commentId));
  await tracer({ categorie: "paiement", action: "paiement_commentaire_supprime", libelle: "Commentaire de paiement supprimé" });

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
