"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { runIcalSync } from "@/lib/ical/sync";
import { nowInMorocco } from "@/lib/now";

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

export async function updateOperationalInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({
      assigneCheckin: String(formData.get("assigneCheckin") ?? "").trim() || null,
      assigneMenage: String(formData.get("assigneMenage") ?? "").trim() || null,
      formulaireBienvenueEnvoye: formData.get("formulaireBienvenueEnvoye") === "on",
      formulaireCheckinRecu: formData.get("formulaireCheckinRecu") === "on",
      aRelancer: formData.get("aRelancer") === "on",
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

// Superhote n'exporte pas toujours l'heure exacte dans son flux iCal (ex. réservations
// Booking.com) : l'app retombe alors sur une heure par défaut (14h/11h) qui peut être fausse.
// Cette action permet de corriger l'heure à la main quand le staff connaît l'heure réelle
// (ex. vue directement dans l'app Superhote).
export async function updateReservationTimes(reservationId: string, checkInTime: string, checkOutTime: string) {
  await auth.protect();

  const [hIn, mIn] = checkInTime.split(":").map(Number);
  const [hOut, mOut] = checkOutTime.split(":").map(Number);
  if ([hIn, mIn, hOut, mOut].some((n) => Number.isNaN(n))) {
    throw new Error("Heure invalide.");
  }

  const db = getDb();
  const [current] = await db
    .select({ checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!current) throw new Error("Réservation introuvable.");

  const newCheckIn = new Date(current.checkIn);
  newCheckIn.setHours(hIn, mIn, 0, 0);
  const newCheckOut = new Date(current.checkOut);
  newCheckOut.setHours(hOut, mOut, 0, 0);

  await db
    .update(reservations)
    .set({ checkIn: newCheckIn, checkOut: newCheckOut, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Confirme que le check-in/check-out a effectivement été fait sur place (distinct de l'heure
// prévue) : garde une trace de qui l'a validé et quand.
export async function validateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const user = await currentUser();
  const validePar = user?.fullName ?? user?.username ?? "Équipe";

  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: nowInMorocco(), checkinValidePar: validePar }
        : { checkoutValideAt: nowInMorocco(), checkoutValidePar: validePar }
    )
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function unvalidateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: null, checkinValidePar: null }
        : { checkoutValideAt: null, checkoutValidePar: null }
    )
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function triggerIcalSync() {
  await auth.protect();
  const result = await runIcalSync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? {
        success: true,
        message:
          `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s))` +
          (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
          ".",
      }
    : { success: false, message: result.error };
}
