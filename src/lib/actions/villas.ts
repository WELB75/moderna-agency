"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";

export async function createVilla(formData: FormData) {
  await auth.protect();

  const numero = String(formData.get("numero") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();
  const superhoteListingId = String(formData.get("superhoteListingId") ?? "").trim();
  const domaineId = String(formData.get("domaineId") ?? "").trim();
  const codeBoitier = String(formData.get("codeBoitier") ?? "").trim();

  if (!numero || !nom) {
    throw new Error("Le numéro et le nom de la villa sont obligatoires.");
  }

  const db = getDb();
  await db.insert(villas).values({
    numero,
    nom,
    adresse: adresse || null,
    superhoteListingId: superhoteListingId || null,
    domaineId: domaineId || null,
    codeBoitier: codeBoitier || null,
  });

  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

export async function deleteVilla(villaId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(villas).where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

export async function updateVillaPhoto(villaId: string, photoUrl: string) {
  await auth.protect();
  const db = getDb();
  await db.update(villas).set({ photoUrl, updatedAt: new Date() }).where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaCodeBoitier(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const codeBoitier = String(formData.get("codeBoitier") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ codeBoitier: codeBoitier || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaIcalUrl(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const icalUrl = String(formData.get("icalUrl") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ icalUrl: icalUrl || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}
