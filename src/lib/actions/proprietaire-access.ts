"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

export async function regenerateProprietaireToken(villaId: string) {
  await auth.protect();
  const db = getDb();
  const [updated] = await db
    .update(villas)
    .set({ lienProprietaireToken: sql`gen_random_uuid()` })
    .where(eq(villas.id, villaId))
    .returning({ lienProprietaireToken: villas.lienProprietaireToken });
  const [v] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({ categorie: "logement", action: "lien_proprietaire_regenere", libelle: "Lien propriétaire régénéré", resume: v?.nom ?? null, villaId, villaNom: v?.nom });

  revalidatePath(`/villas/${villaId}`);
  return updated;
}
