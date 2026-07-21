"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { proprieteContacts } from "@/db/schema";

export async function createContact(formData: FormData) {
  await auth.protect();

  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const domaineId = String(formData.get("domaineId") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const paiementRecurrent = formData.get("paiementRecurrent") === "on";

  if (!villaId && !domaineId) throw new Error("Choisis une villa ou un domaine.");
  if (!role) throw new Error("Le rôle est obligatoire.");
  if (!nom) throw new Error("Le nom est obligatoire.");

  const db = getDb();
  await db.insert(proprieteContacts).values({
    villaId,
    domaineId,
    role: role as (typeof proprieteContacts.$inferInsert)["role"],
    nom,
    telephone: telephone || null,
    notes: notes || null,
    paiementRecurrent,
  });

  revalidatePath("/villas");
}

export async function deleteContact(contactId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(proprieteContacts).where(eq(proprieteContacts.id, contactId));
  revalidatePath("/villas");
}
