"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";

// Une prolongation en direct (« Prolongation en direct du séjour Booking.com ») est une réservation
// à part, sans numéro Beds24 ni caution : la caution à recevoir est sur la réservation d'origine.
// Retrouve cette réservation (même logement, même voyageur, dates qui se touchent) pour que le bouton
// « Message de caution » puisse envoyer son vrai lien.
export type CautionOrigine = { beds24BookingId: string; montant: number; devise: string; villaNom: string | null };

const JOUR_MS = 24 * 60 * 60 * 1000;

export async function cautionDeLaReservationOrigine(reservationId: string): Promise<CautionOrigine | null> {
  await auth.protect();
  const db = getDb();
  const [r] = await db
    .select({ villaId: reservations.villaId, guestName: reservations.guestName, checkIn: reservations.checkIn, beds24BookingId: reservations.beds24BookingId, caution: reservations.caution })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r || !r.villaId || r.beds24BookingId || Number(r.caution) > 0) return null;

  const candidates = await db
    .select({
      beds24BookingId: reservations.beds24BookingId,
      guestName: reservations.guestName,
      checkOut: reservations.checkOut,
      canal: reservations.canal,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
    })
    .from(reservations)
    .where(and(eq(reservations.villaId, r.villaId), ne(reservations.status, "annulee")));

  const nom = r.guestName.trim().toLowerCase();
  const origine = candidates.find(
    (c) =>
      c.beds24BookingId &&
      c.guestName.trim().toLowerCase() === nom &&
      Math.abs(c.checkOut.getTime() - r.checkIn.getTime()) <= JOUR_MS &&
      Number(c.caution) > 0 &&
      !c.cautionPayee &&
      !(c.canal ?? "").toLowerCase().includes("airbnb"),
  );
  if (!origine?.beds24BookingId) return null;
  return { beds24BookingId: origine.beds24BookingId, montant: Number(origine.caution), devise: origine.devisePaiement, villaNom: null };
}
