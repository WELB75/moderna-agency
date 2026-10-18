"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { maintenanceRecords, villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

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

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({
    categorie: "maintenance",
    action: "maintenance_enregistree",
    libelle: "Entretien enregistré",
    resume: `${equipement} (${categorie})${villa ? ` - ${villa.nom}` : ""}`,
    villaId,
    villaNom: villa?.nom ?? null,
  });

  revalidatePath("/maintenance");
  revalidatePath(`/villas/${villaId}`);
  revalidatePath("/dashboard");
  return record.id;
}

export async function deleteMaintenanceRecord(recordId: string) {
  await auth.protect();
  const db = getDb();
  const [avant] = await db
    .select({ equipement: maintenanceRecords.equipement, villaId: maintenanceRecords.villaId, villaNom: villas.nom })
    .from(maintenanceRecords)
    .leftJoin(villas, eq(villas.id, maintenanceRecords.villaId))
    .where(eq(maintenanceRecords.id, recordId))
    .limit(1);
  await db.delete(maintenanceRecords).where(eq(maintenanceRecords.id, recordId));
  await tracer({
    categorie: "maintenance",
    action: "maintenance_supprimee",
    libelle: "Entretien supprimé",
    resume: avant ? `${avant.equipement}${avant.villaNom ? ` - ${avant.villaNom}` : ""}` : null,
    villaId: avant?.villaId ?? null,
    villaNom: avant?.villaNom ?? null,
  });
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
