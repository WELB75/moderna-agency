"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries } from "@/db/schema";

export async function createCashEntry(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const reservationId = String(formData.get("reservationId") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");
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

export async function deleteCashEntry(entryId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(cashEntries).where(eq(cashEntries.id, entryId));
  revalidatePath("/caisse");
}
