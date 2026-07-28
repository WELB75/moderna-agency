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
  const numeroImmeuble = String(formData.get("numeroImmeuble") ?? "").trim();
  const superhoteListingId = String(formData.get("superhoteListingId") ?? "").trim();
  const domaineId = String(formData.get("domaineId") ?? "").trim();
  const codeBoitier = String(formData.get("codeBoitier") ?? "").trim();
  const codePorteEntree = String(formData.get("codePorteEntree") ?? "").trim();
  const type = String(formData.get("type") ?? "villa").trim() || "villa";

  if (!numero || !nom) {
    throw new Error("Le numéro et le nom de la villa sont obligatoires.");
  }

  const db = getDb();
  await db.insert(villas).values({
    type: type === "appartement" ? "appartement" : "villa",
    numero,
    nom,
    adresse: adresse || null,
    numeroImmeuble: numeroImmeuble || null,
    superhoteListingId: superhoteListingId || null,
    domaineId: domaineId || null,
    codeBoitier: codeBoitier || null,
    codePorteEntree: codePorteEntree || null,
  });

  revalidatePath("/villas");
  revalidatePath("/appartements");
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

// Certaines villas ont un second code, distinct du boîtier à clés, pour le digicode de la
// porte d'entrée elle-même.
export async function updateVillaCodePorteEntree(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const codePorteEntree = String(formData.get("codePorteEntree") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ codePorteEntree: codePorteEntree || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaProprietaire(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const proprietaireNom = String(formData.get("proprietaireNom") ?? "").trim();
  const proprietaireTelephone = String(formData.get("proprietaireTelephone") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({
      proprietaireNom: proprietaireNom || null,
      proprietaireTelephone: proprietaireTelephone || null,
      updatedAt: new Date(),
    })
    .where(eq(villas.id, villaId));
  revalidatePath("/villas");
  revalidatePath("/proprietaires");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaInfo(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();
  const numeroImmeuble = String(formData.get("numeroImmeuble") ?? "").trim();
  const domaineId = String(formData.get("domaineId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const personnelPayeParProprietaire = formData.get("personnelPayeParProprietaire") === "on";
  const portailAuteursRaw = String(formData.get("portailAuteurs") ?? "").trim();
  const portailAuteurs = portailAuteursRaw
    ? portailAuteursRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (!villaId) throw new Error("Villa introuvable.");
  if (!numero || !nom) {
    throw new Error("Le numéro et le nom de la villa sont obligatoires.");
  }

  const db = getDb();
  await db
    .update(villas)
    .set({
      numero,
      nom,
      adresse: adresse || null,
      numeroImmeuble: numeroImmeuble || null,
      domaineId: domaineId || null,
      notes: notes || null,
      personnelPayeParProprietaire,
      portailAuteurs,
      updatedAt: new Date(),
    })
    .where(eq(villas.id, villaId));
  revalidatePath("/personnel");
  revalidatePath("/dashboard");
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
