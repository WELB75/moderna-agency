"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { runSuperhoteSync } from "@/lib/superhote/sync";
import { runIcalSync } from "@/lib/ical/sync";

export async function createReservation(formData: FormData) {
  await auth.protect();

  const villaId = String(formData.get("villaId") ?? "");
  const guestName = String(formData.get("guestName") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const nbAdultes = Number(formData.get("nbAdultes") ?? 0) || null;
  const nbEnfants = Number(formData.get("nbEnfants") ?? 0) || null;
  const guestsCount = (nbAdultes ?? 0) + (nbEnfants ?? 0) || null;
  const notes = String(formData.get("notes") ?? "").trim();

  if (!villaId || !guestName || !checkIn || !checkOut) {
    throw new Error("Villa, nom du client, arrivée et départ sont obligatoires.");
  }

  const db = getDb();
  await db.insert(reservations).values({
    villaId,
    guestName,
    guestPhone: guestPhone || null,
    checkIn: new Date(checkIn),
    checkOut: new Date(checkOut),
    guestsCount,
    nbAdultes,
    nbEnfants,
    notes: notes || null,
    source: "manuel",
    status: "confirmee",
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function updatePaymentInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) {
    throw new Error("Réservation introuvable.");
  }

  const loyerTotalRaw = String(formData.get("loyerTotal") ?? "").trim();
  const montantPayeRaw = String(formData.get("montantPaye") ?? "").trim();
  const cautionRaw = String(formData.get("caution") ?? "").trim();
  const cautionPayee = formData.get("cautionPayee") === "on";
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "").trim();
  const notesPaiement = String(formData.get("notesPaiement") ?? "").trim();
  const devisePaiement = String(formData.get("devisePaiement") ?? "EUR").trim() || "EUR";

  const loyerTotal = loyerTotalRaw ? Number(loyerTotalRaw.replace(",", ".")).toFixed(2) : null;
  const montantPaye = montantPayeRaw ? Number(montantPayeRaw.replace(",", ".")).toFixed(2) : null;
  const caution = cautionRaw ? Number(cautionRaw.replace(",", ".")).toFixed(2) : null;

  const db = getDb();
  await db
    .update(reservations)
    .set({
      loyerTotal,
      montantPaye,
      caution,
      devisePaiement,
      cautionPayee,
      moyenPaiement: moyenPaiement || null,
      notesPaiement: notesPaiement || null,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function deleteReservation(reservationId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(reservations).where(eq(reservations.id, reservationId));
  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function triggerSuperhoteSync() {
  await auth.protect();
  const result = await runSuperhoteSync();
  revalidatePath("/dashboard");
  return result.success
    ? { success: true, message: `${result.bookingsSynced} réservation(s) synchronisée(s).` }
    : { success: false, message: result.error };
}

export async function triggerIcalSync() {
  await auth.protect();
  const result = await runIcalSync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? { success: true, message: `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s)).` }
    : { success: false, message: result.error };
}
