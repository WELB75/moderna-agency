"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paiementsProprietaire } from "@/db/schema";

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

  revalidatePath("/villas");
}

export async function deletePaiementProprietaire(paiementId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(paiementsProprietaire).where(eq(paiementsProprietaire.id, paiementId));
  revalidatePath("/villas");
}
