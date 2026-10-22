"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { syndicLogements } from "@/db/schema-syndic";
import { assurerTableSyndic } from "@/lib/syndic";
import { tracer } from "@/lib/journal";

// En-tête du syndic d'un appartement, saisi une fois depuis la page de la déclaration (là où
// l'équipe s'aperçoit qu'il manque) et réutilisé pour tous les séjours suivants.
export async function enregistrerSyndicLogement(villaId: string, entete: string, residence: string, whatsapp = "") {
  await auth.protect();
  const enteteNettoyee = entete.trim();
  const residenceNettoyee = residence.trim();
  const whatsappNettoye = whatsapp.replace(/[^\d+]/g, "") || null;
  if (!enteteNettoyee || !residenceNettoyee) throw new Error("L'en-tête du syndic et la résidence sont obligatoires.");

  await assurerTableSyndic();
  const db = getDb();
  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  if (!villa) throw new Error("Logement introuvable.");

  await db
    .insert(syndicLogements)
    .values({ villaId, entete: enteteNettoyee, residence: residenceNettoyee, whatsapp: whatsappNettoye })
    .onConflictDoUpdate({
      target: syndicLogements.villaId,
      set: { entete: enteteNettoyee, residence: residenceNettoyee, whatsapp: whatsappNettoye, updatedAt: sql`now()` },
    });

  await tracer({
    categorie: "villa",
    action: "syndic_modifie",
    libelle: "En-tête syndic enregistré",
    resume: `${villa.nom} — résidence ${residenceNettoyee}`,
    villaId,
    villaNom: villa.nom,
  });

  revalidatePath("/declaration-syndic", "layout");
  revalidatePath(`/villas/${villaId}`);
}
