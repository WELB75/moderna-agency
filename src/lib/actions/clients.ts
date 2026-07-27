"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";

export async function createClient(formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!nom) throw new Error("Le nom est obligatoire.");

  const db = getDb();
  await db.insert(clients).values({
    nom,
    telephone: telephone || null,
    email: email || null,
    notes: notes || null,
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
}

export async function updateClient(clientId: string, formData: FormData) {
  await auth.protect();

  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!nom) throw new Error("Le nom est obligatoire.");

  const db = getDb();
  await db
    .update(clients)
    .set({ nom, telephone: telephone || null, email: email || null, notes: notes || null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  revalidatePath("/clients");
  revalidatePath("/dashboard");
}

export async function deleteClient(clientId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(clients).where(eq(clients.id, clientId));
  revalidatePath("/clients");
  revalidatePath("/dashboard");
}
