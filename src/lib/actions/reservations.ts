"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { runSuperhoteSync } from "@/lib/superhote/sync";

export async function createReservation(formData: FormData) {
  await auth.protect();

  const villaId = String(formData.get("villaId") ?? "");
  const guestName = String(formData.get("guestName") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const guestsCount = Number(formData.get("guestsCount") ?? 0) || null;

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
    source: "manuel",
    status: "confirmee",
  });

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
