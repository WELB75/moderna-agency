"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries, villas } from "@/db/schema";
import { analyzeCashReceipt } from "@/lib/caisse-receipt-ai";

export async function createCashEntry(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const reservationId = String(formData.get("reservationId") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");
  const categorie = String(formData.get("categorie") ?? "").trim() || null;
  const caisse = String(formData.get("caisse") ?? "societe");
  const financePar = String(formData.get("financePar") ?? "societe");
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "especes");
  const montant = String(formData.get("montant") ?? "").trim();
  const devise = String(formData.get("devise") ?? "MAD").trim() || "MAD";
  const description = String(formData.get("description") ?? "").trim();
  const responsable = String(formData.get("responsable") ?? "").trim() || null;
  const photoUrlsRaw = String(formData.get("photoUrls") ?? "").trim();
  const photoUrls = photoUrlsRaw ? (JSON.parse(photoUrlsRaw) as string[]) : [];

  if (!["remise", "loyer", "extra", "depense", "restitution"].includes(type)) {
    throw new Error("Type de mouvement invalide.");
  }
  if (!["societe", "brahim"].includes(caisse)) {
    throw new Error("Caisse invalide.");
  }
  if (!["societe", "loyers_perso"].includes(financePar)) {
    throw new Error("Source de financement invalide.");
  }
  if (
    categorie &&
    !["femmes_menage", "cuisinieres", "jardinier", "coursier", "hebergement", "autre"].includes(categorie)
  ) {
    throw new Error("Catégorie de dépense invalide.");
  }
  if (type === "depense" && !categorie) {
    throw new Error("Choisis une catégorie pour cette dépense.");
  }
  if (categorie === "hebergement" && !villaId) {
    throw new Error("Choisis le bien concerné pour une dépense d'hébergement.");
  }
  if (!["especes", "virement", "carte"].includes(moyenPaiement)) {
    throw new Error("Moyen de paiement invalide.");
  }
  const montantNum = Number(montant.replace(",", "."));
  if (!montantNum || montantNum <= 0) {
    throw new Error("Le montant doit être un nombre positif.");
  }

  const db = getDb();
  await db.insert(cashEntries).values({
    villaId,
    reservationId,
    type: type as "remise" | "loyer" | "extra" | "depense" | "restitution",
    categorie:
      type === "depense"
        ? (categorie as "femmes_menage" | "cuisinieres" | "jardinier" | "coursier" | "hebergement" | "autre")
        : null,
    caisse: ["remise", "depense", "restitution"].includes(type) ? (caisse as "societe" | "brahim") : "societe",
    financePar: type === "depense" ? (financePar as "societe" | "loyers_perso") : "societe",
    moyenPaiement: moyenPaiement as "especes" | "virement" | "carte",
    montant: montantNum.toFixed(2),
    devise,
    description: description || null,
    responsable,
    photoUrls,
    createdByUserId: user?.id ?? "inconnu",
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/caisse");
}

export async function addCashEntryPhotos(entryId: string, photoUrls: string[]) {
  await auth.protect();
  const db = getDb();
  const [entry] = await db.select().from(cashEntries).where(eq(cashEntries.id, entryId)).limit(1);
  if (!entry) throw new Error("Mouvement introuvable.");

  await db
    .update(cashEntries)
    .set({ photoUrls: [...(entry.photoUrls ?? []), ...photoUrls] })
    .where(eq(cashEntries.id, entryId));

  revalidatePath("/caisse");
}

// Préremplissage IA d'une dépense à partir des photos du reçu (voir AddCashEntryDialog) —
// renvoie les champs extraits pour que Kamel les relise et les corrige si besoin avant
// d'enregistrer, jamais une écriture directe en caisse. Kamel, 2026-09-07 : "j'aimerais que
// l'IA elle puisse vraiment très bien les analyser [...] on verra avec les tests".
export async function analyzeCashReceiptPhotos(photoUrls: string[]) {
  await auth.protect();
  const extraction = await analyzeCashReceipt(photoUrls);

  let villaId: string | null = null;
  let villaLabel: string | null = null;
  const warnings = [...extraction.warnings];

  if (extraction.villaNumero) {
    const db = getDb();
    const [match] = await db.select({ id: villas.id, nom: villas.nom, numero: villas.numero }).from(villas).where(eq(villas.numero, extraction.villaNumero)).limit(1);
    if (match) {
      villaId = match.id;
      villaLabel = `${match.nom} (n°${match.numero})`;
    } else {
      warnings.push(`Numéro de villa "${extraction.villaNumero}" lu sur le reçu mais introuvable dans la liste des villas.`);
    }
  }

  return {
    montant: extraction.montant,
    description: extraction.description,
    villaId,
    villaLabel,
    warnings,
  };
}

export async function deleteCashEntry(entryId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(cashEntries).where(eq(cashEntries.id, entryId));
  revalidatePath("/caisse");
}
