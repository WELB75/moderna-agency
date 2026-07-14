"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domaines } from "@/db/schema";

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

  revalidatePath("/villas");
}

export async function deleteDomaine(domaineId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(domaines).where(eq(domaines.id, domaineId));
  revalidatePath("/villas");
}
