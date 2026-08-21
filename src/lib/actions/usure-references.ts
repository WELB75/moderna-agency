"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { usureReferences } from "@/db/schema";
import { DEFAULT_USURE_REFERENCES } from "@/lib/usure-references-defaults";

export async function seedDefaultUsureReferences() {
  await auth.protect();
  const db = getDb();
  await db.insert(usureReferences).values(
    DEFAULT_USURE_REFERENCES.map((ref, index) => ({
      typeObjet: ref.typeObjet,
      dureeVieAttendueMois: ref.dureeVieAttendueMois,
      criteres: ref.criteres,
      ordre: index,
    }))
  );
  revalidatePath("/inventaire");
}

export async function createUsureReference() {
  await auth.protect();
  const db = getDb();
  const [ref] = await db
    .insert(usureReferences)
    .values({ typeObjet: "Nouveau type d'objet", ordre: 999 })
    .returning();
  revalidatePath("/inventaire");
  return ref.id;
}

export async function updateUsureReference(
  id: string,
  input: { typeObjet: string; dureeVieAttendueMois: number | null; criteres: string | null }
) {
  await auth.protect();
  if (!input.typeObjet.trim()) throw new Error("Le type d'objet est obligatoire.");

  const db = getDb();
  await db
    .update(usureReferences)
    .set({
      typeObjet: input.typeObjet.trim(),
      dureeVieAttendueMois: input.dureeVieAttendueMois,
      criteres: input.criteres || null,
      updatedAt: new Date(),
    })
    .where(eq(usureReferences.id, id));
  revalidatePath("/inventaire");
}

export async function deleteUsureReference(id: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(usureReferences).where(eq(usureReferences.id, id));
  revalidatePath("/inventaire");
}
