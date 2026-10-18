"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { usureReferences } from "@/db/schema";
import { tracer } from "@/lib/journal";
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
  await tracer({ categorie: "inventaire", action: "usure_reference_defauts", libelle: "Références d'usure par défaut ajoutées" });
  revalidatePath("/inventaire");
}

export async function createUsureReference() {
  await auth.protect();
  const db = getDb();
  const [ref] = await db
    .insert(usureReferences)
    .values({ typeObjet: "Nouveau type d'objet", ordre: 999 })
    .returning();
  await tracer({ categorie: "inventaire", action: "usure_reference_creee", libelle: "Référence d'usure créée", resume: ref.typeObjet });
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
  await tracer({ categorie: "inventaire", action: "usure_reference_modifiee", libelle: "Référence d'usure modifiée", resume: input.typeObjet.trim() });
  revalidatePath("/inventaire");
}

export async function deleteUsureReference(id: string) {
  await auth.protect();
  const db = getDb();
  const [ref] = await db.select({ typeObjet: usureReferences.typeObjet }).from(usureReferences).where(eq(usureReferences.id, id)).limit(1);
  await db.delete(usureReferences).where(eq(usureReferences.id, id));
  await tracer({ categorie: "inventaire", action: "usure_reference_supprimee", libelle: "Référence d'usure supprimée", resume: ref?.typeObjet ?? null });
  revalidatePath("/inventaire");
}
