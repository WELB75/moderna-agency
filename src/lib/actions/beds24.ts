"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { runBeds24Sync } from "@/lib/beds24/sync";
import { beds24SendMessage } from "@/lib/beds24/client";

// Déclenchement manuel depuis le tableau de bord (bouton dans "Options"), même principe que
// triggerIcalSync — utile tant qu'aucun cron n'est en place, notamment pour valider la connexion
// Beds24 sur la propriété test avant de migrer une vraie villa.
export async function triggerBeds24Sync() {
  await auth.protect();
  const result = await runBeds24Sync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? {
        success: true,
        message:
          `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s) connectée(s) à Beds24)` +
          (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
          ".",
      }
    : { success: false, message: result.error };
}

// Répondre à un voyageur Airbnb/Booking.com depuis la boîte de réception — Kamel, 2026-09-15 :
// "je veux pouvoir aussi y répondre sur l'app". Le bookingId n'est jamais pris tel quel côté
// client : on le retrouve ici à partir du reservationId pour n'envoyer que sur une résa qui
// appartient bien à cette réservation (même logique que les autres actions par id plutôt que par
// valeur brute fournie par le client).
export async function sendBeds24Message(reservationId: string, message: string) {
  await auth.protect();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message ne peut pas être vide.");

  const db = getDb();
  const [reservation] = await db
    .select({ beds24BookingId: reservations.beds24BookingId })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!reservation?.beds24BookingId) throw new Error("Cette réservation n'est pas liée à un canal Beds24.");

  await beds24SendMessage(Number(reservation.beds24BookingId), trimmed);
  revalidatePath("/inbox");
}
