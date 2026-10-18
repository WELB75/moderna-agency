"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicians } from "@/db/schema";
import { tracer } from "@/lib/journal";

export async function createTechnician(formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const fonction = String(formData.get("fonction") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!nom || !fonction || !telephone) {
    throw new Error("Nom, fonction et téléphone sont obligatoires.");
  }

  const db = getDb();
  await db.insert(technicians).values({
    nom,
    fonction,
    telephone,
    notes: notes || null,
  });
  await tracer({ categorie: "maintenance", action: "technicien_cree", libelle: "Technicien ajouté", resume: `${nom} (${fonction})` });

  revalidatePath("/maintenance");
}

export async function deleteTechnician(technicianId: string) {
  await auth.protect();
  const db = getDb();
  const [t] = await db.select({ nom: technicians.nom, fonction: technicians.fonction }).from(technicians).where(eq(technicians.id, technicianId)).limit(1);
  await db.delete(technicians).where(eq(technicians.id, technicianId));
  await tracer({ categorie: "maintenance", action: "technicien_supprime", libelle: "Technicien supprimé", resume: t ? `${t.nom} (${t.fonction})` : null });
  revalidatePath("/maintenance");
}
