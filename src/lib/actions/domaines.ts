"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domaines } from "@/db/schema";
import { tracer } from "@/lib/journal";

async function nomDomaine(domaineId: string): Promise<string | null> {
  const [d] = await getDb().select({ nom: domaines.nom }).from(domaines).where(eq(domaines.id, domaineId)).limit(1);
  return d?.nom ?? null;
}

export async function createDomaine(formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();

  if (!nom) {
    throw new Error("Le nom du domaine est obligatoire.");
  }

  const db = getDb();
  await db.insert(domaines).values({
    nom,
    adresse: adresse || null,
  });
  await tracer({ categorie: "logement", action: "domaine_cree", libelle: "Domaine créé", resume: nom });

  revalidatePath("/villas");
}

export async function updateDomaineLocation(domaineId: string, mapsUrl: string, wazeUrl: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(domaines)
    .set({ mapsUrl: mapsUrl.trim() || null, wazeUrl: wazeUrl.trim() || null })
    .where(eq(domaines.id, domaineId));
  await tracer({ categorie: "logement", action: "domaine_localisation", libelle: "Localisation du domaine modifiée", resume: await nomDomaine(domaineId) });
  revalidatePath("/villas");
  revalidatePath("/interventions");
}

export async function deleteDomaine(domaineId: string) {
  await auth.protect();
  const db = getDb();
  const nom = await nomDomaine(domaineId);
  await db.delete(domaines).where(eq(domaines.id, domaineId));
  await tracer({ categorie: "logement", action: "domaine_supprime", libelle: "Domaine supprimé", resume: nom });
  revalidatePath("/villas");
}
