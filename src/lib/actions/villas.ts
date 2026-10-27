"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

// Nom lisible du logement pour le journal (vide si introuvable).
async function nomVilla(villaId: string): Promise<string | null> {
  const [v] = await getDb().select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  return v?.nom ?? null;
}

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
  await tracer({
    categorie: "logement",
    action: "logement_cree",
    libelle: type === "appartement" ? "Appartement créé" : "Villa créée",
    resume: `${numero} - ${nom}`,
    villaNom: nom,
  });

  revalidatePath("/villas");
  revalidatePath("/appartements");
  revalidatePath("/dashboard");
}

export async function deleteVilla(villaId: string) {
  await auth.protect();
  const db = getDb();
  const nom = await nomVilla(villaId);
  await db.delete(villas).where(eq(villas.id, villaId));
  await tracer({ categorie: "logement", action: "logement_supprime", libelle: "Logement supprimé", resume: nom, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath("/dashboard");
}

export async function updateVillaPhoto(villaId: string, photoUrl: string) {
  await auth.protect();
  const db = getDb();
  await db.update(villas).set({ photoUrl, updatedAt: new Date() }).where(eq(villas.id, villaId));
  const nomPhoto = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_photo", libelle: "Photo du logement modifiée", resume: nomPhoto, villaId, villaNom: nomPhoto });
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
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_code_boitier", libelle: "Code du boîtier à clés modifié", resume: nom, villaId, villaNom: nom });
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
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_code_porte", libelle: "Code de la porte d'entrée modifié", resume: nom, villaId, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

// Fiche de connaissances de la villa pour l'agent IA des messages Airbnb / Booking.com.
export async function updateVillaBaseConnaissances(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const baseConnaissances = String(formData.get("baseConnaissances") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ baseConnaissances: baseConnaissances || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_base_connaissances", libelle: "Fiche de connaissances de l'agent IA modifiée", resume: nom, villaId, villaNom: nom });
  revalidatePath(`/villas/${villaId}`);
}

// Un troisième code possible, pour la porte de la chambre principale.
export async function updateVillaCodeChambreMaster(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const codeChambreMaster = String(formData.get("codeChambreMaster") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ codeChambreMaster: codeChambreMaster || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_code_chambre", libelle: "Code de la chambre principale modifié", resume: nom, villaId, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaCodeWifi(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const codeWifi = String(formData.get("codeWifi") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ codeWifi: codeWifi || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_code_wifi", libelle: "Code wifi modifié", resume: nom, villaId, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

export async function updateVillaGuideBienvenueUrl(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const guideBienvenueUrl = String(formData.get("guideBienvenueUrl") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ guideBienvenueUrl: guideBienvenueUrl || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_guide", libelle: "Guide de bienvenue modifié", resume: nom, villaId, villaNom: nom });
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
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_proprietaire", libelle: "Propriétaire du logement modifié", resume: nom, villaId, villaNom: nom });
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
  const personnelPayeParProprietaireNomsRaw = String(formData.get("personnelPayeParProprietaireNoms") ?? "").trim();
  const personnelPayeParProprietaireNoms = personnelPayeParProprietaireNomsRaw
    ? personnelPayeParProprietaireNomsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
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
      personnelPayeParProprietaireNoms,
      portailAuteurs,
      updatedAt: new Date(),
    })
    .where(eq(villas.id, villaId));
  await tracer({ categorie: "logement", action: "logement_modifie", libelle: "Logement modifié", resume: `${numero} - ${nom}`, villaId, villaNom: nom });
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
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_ical", libelle: "Lien iCal modifié", resume: nom, villaId, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

// Liens iCal natifs Airbnb/Booking.com (gratuits, sans channel manager) — voir runDirectPlatformSync.
export async function updateVillaDirectIcalUrls(formData: FormData) {
  await auth.protect();
  const villaId = String(formData.get("villaId") ?? "").trim();
  const airbnbIcalUrl = String(formData.get("airbnbIcalUrl") ?? "").trim();
  const bookingIcalUrl = String(formData.get("bookingIcalUrl") ?? "").trim();
  if (!villaId) throw new Error("Villa introuvable.");

  const db = getDb();
  await db
    .update(villas)
    .set({ airbnbIcalUrl: airbnbIcalUrl || null, bookingIcalUrl: bookingIcalUrl || null, updatedAt: new Date() })
    .where(eq(villas.id, villaId));
  const nom = await nomVilla(villaId);
  await tracer({ categorie: "logement", action: "logement_ical_direct", libelle: "Liens iCal Airbnb/Booking modifiés", resume: nom, villaId, villaNom: nom });
  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}
