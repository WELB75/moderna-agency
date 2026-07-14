"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicians } from "@/db/schema";

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

  revalidatePath("/maintenance");
}

export async function deleteTechnician(technicianId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(technicians).where(eq(technicians.id, technicianId));
  revalidatePath("/maintenance");
}
