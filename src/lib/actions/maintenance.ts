"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { maintenanceRecords } from "@/db/schema";

export async function createMaintenanceRecord(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim();
  const equipement = String(formData.get("equipement") ?? "").trim();
  const dateIntervention = String(formData.get("dateIntervention") ?? "").trim();
  const prochaineDatePrevue = String(formData.get("prochaineDatePrevue") ?? "").trim();
  const prestataire = String(formData.get("prestataire") ?? "").trim();
  const cout = String(formData.get("cout") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!villaId || !categorie || !equipement || !dateIntervention) {
    throw new Error("Villa, catégorie, équipement et date sont obligatoires.");
  }

  const db = getDb();
  const [record] = await db
    .insert(maintenanceRecords)
    .values({
      villaId,
      categorie,
      equipement,
      dateIntervention: new Date(dateIntervention),
      prochaineDatePrevue: prochaineDatePrevue ? new Date(prochaineDatePrevue) : null,
      prestataire: prestataire || null,
      cout: cout ? Number(cout.replace(",", ".")).toFixed(2) : null,
      notes: notes || null,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath("/maintenance");
  revalidatePath(`/villas/${villaId}`);
  revalidatePath("/dashboard");
  return record.id;
}

export async function deleteMaintenanceRecord(recordId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(maintenanceRecords).where(eq(maintenanceRecords.id, recordId));
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
}

export async function addMaintenancePhoto(recordId: string, url: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(maintenanceRecords)
    .set({
      photoUrls: sql`coalesce(${maintenanceRecords.photoUrls}, '[]'::jsonb) || ${JSON.stringify([url])}::jsonb`,
    })
    .where(eq(maintenanceRecords.id, recordId));
  revalidatePath("/maintenance");
}
