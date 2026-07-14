"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { taches } from "@/db/schema";

export async function createTache(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim();
  const titre = String(formData.get("titre") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!villaId || !titre) {
    throw new Error("Villa et titre sont obligatoires.");
  }

  const db = getDb();
  const [record] = await db
    .insert(taches)
    .values({
      villaId,
      titre,
      description: description || null,
      statut: "en_attente",
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath("/maintenance");
  return record.id;
}

export async function updateTacheStatut(
  tacheId: string,
  statut: "en_attente" | "en_cours" | "termine"
) {
  await auth.protect();
  const db = getDb();
  await db
    .update(taches)
    .set({ statut, updatedAt: new Date() })
    .where(eq(taches.id, tacheId));
  revalidatePath("/maintenance");
}

export async function deleteTache(tacheId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(taches).where(eq(taches.id, tacheId));
  revalidatePath("/maintenance");
}

export async function addTachePhoto(tacheId: string, url: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(taches)
    .set({
      photoUrls: sql`coalesce(${taches.photoUrls}, '[]'::jsonb) || ${JSON.stringify([url])}::jsonb`,
    })
    .where(eq(taches.id, tacheId));
  revalidatePath("/maintenance");
}
