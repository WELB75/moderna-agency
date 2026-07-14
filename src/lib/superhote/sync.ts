import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas, superhoteSyncLog } from "@/db/schema";
import {
  fetchSuperhoteBookings,
  isSuperhoteConfigured,
  SuperhoteApiError,
  SuperhoteConfigError,
} from "@/lib/superhote/client";

export async function runSuperhoteSync(): Promise<
  { success: true; bookingsSynced: number } | { success: false; error: string }
> {
  if (!isSuperhoteConfigured()) {
    return { success: false, error: "SUPERHOTE_API_KEY n'est pas configurée." };
  }

  const db = getDb();
  const startedAt = new Date();

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const allVillas = await db.select().from(villas);
    const villasWithKey = allVillas.filter((v) => v.superhoteListingId);
    const targets =
      villasWithKey.length > 0 ? villasWithKey : [{ id: null, superhoteListingId: undefined } as const];

    let totalSynced = 0;

    for (const villa of targets) {
      const bookings = await fetchSuperhoteBookings({
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        propertyKey: villa.superhoteListingId ?? undefined,
      });

      for (const booking of bookings) {
        const matchedVilla =
          villa.id ?? allVillas.find((v) => v.superhoteListingId === booking.property_key)?.id ?? null;

        const existing = await db
          .select()
          .from(reservations)
          .where(eq(reservations.superhoteBookingId, booking.id))
          .limit(1);

        const values = {
          villaId: matchedVilla,
          superhoteBookingId: booking.id,
          guestName: `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || "Client Superhote",
          guestPhone: booking.phone ?? null,
          guestEmail: booking.email ?? null,
          checkIn: new Date(booking.checking),
          checkOut: new Date(booking.checkout),
          guestsCount: (booking.nbr_adults ?? 0) + (booking.nbr_children ?? 0) || null,
          nbAdultes: booking.nbr_adults ?? null,
          nbEnfants: booking.nbr_children ?? null,
          status: booking.status ?? "confirmee",
          source: "superhote" as const,
          rawData: booking,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(reservations).set(values).where(eq(reservations.id, existing[0].id));
        } else {
          await db.insert(reservations).values(values);
        }
        totalSynced += 1;
      }
    }

    await db.insert(superhoteSyncLog).values({
      startedAt,
      finishedAt: new Date(),
      success: true,
      bookingsSynced: totalSynced,
    });

    return { success: true, bookingsSynced: totalSynced };
  } catch (err) {
    const message =
      err instanceof SuperhoteConfigError || err instanceof SuperhoteApiError
        ? err.message
        : "Erreur inattendue lors de la synchronisation Superhote.";

    await db.insert(superhoteSyncLog).values({
      startedAt,
      finishedAt: new Date(),
      success: false,
      bookingsSynced: 0,
      errorMessage: message,
    });

    return { success: false, error: message };
  }
}
