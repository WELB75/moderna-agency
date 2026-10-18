"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paiementsProprietaire, villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

// Titre/montant + villa d'une ligne de paiement, pour le résumé du journal.
async function infoPaiement(paiementId: string) {
  const [p] = await getDb()
    .select({ titre: paiementsProprietaire.titre, montant: paiementsProprietaire.montant, devise: paiementsProprietaire.devise, villaId: paiementsProprietaire.villaId, villaNom: villas.nom })
    .from(paiementsProprietaire)
    .leftJoin(villas, eq(villas.id, paiementsProprietaire.villaId))
    .where(eq(paiementsProprietaire.id, paiementId))
    .limit(1);
  return {
    resume: p ? `${p.titre}${p.montant ? ` · ${p.montant} ${p.devise}` : ""}` : null,
    villaId: p?.villaId ?? null,
    villaNom: p?.villaNom ?? null,
  };
}

export async function createPaiementProprietaire(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim();
  const titre = String(formData.get("titre") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const montantRaw = String(formData.get("montant") ?? "").trim();
  const devise = String(formData.get("devise") ?? "DH").trim() || "DH";

  if (!villaId) throw new Error("Villa manquante.");
  if (!titre) throw new Error("Le titre est obligatoire.");

  const db = getDb();
  await db.insert(paiementsProprietaire).values({
    villaId,
    titre,
    description: description || null,
    montant: montantRaw || null,
    devise,
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({
    categorie: "paiement",
    action: "paiement_proprietaire_cree",
    libelle: "Paiement propriétaire ajouté",
    resume: `${titre}${montantRaw ? ` · ${montantRaw} ${devise}` : ""}`,
    villaId,
    villaNom: villa?.nom ?? null,
  });

  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function setPaiementProprietaireStatut(paiementId: string, statut: "en_attente" | "paye") {
  await auth.protect();
  const db = getDb();
  await db
    .update(paiementsProprietaire)
    .set({ statut, updatedAt: new Date() })
    .where(eq(paiementsProprietaire.id, paiementId));

  const info = await infoPaiement(paiementId);
  await tracer({
    categorie: "paiement",
    action: statut === "paye" ? "paiement_proprietaire_paye" : "paiement_proprietaire_en_attente",
    libelle: statut === "paye" ? "Paiement propriétaire marqué payé" : "Paiement propriétaire remis en attente",
    resume: info.resume,
    villaId: info.villaId,
    villaNom: info.villaNom,
  });

  revalidatePath("/villas");
}

export async function deletePaiementProprietaire(paiementId: string) {
  await auth.protect();
  const db = getDb();
  const info = await infoPaiement(paiementId);
  await db.delete(paiementsProprietaire).where(eq(paiementsProprietaire.id, paiementId));
  await tracer({
    categorie: "paiement",
    action: "paiement_proprietaire_supprime",
    libelle: "Paiement propriétaire supprimé",
    resume: info.resume,
    villaId: info.villaId,
    villaNom: info.villaNom,
  });
  revalidatePath("/villas");
}
