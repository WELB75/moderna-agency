import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { villas, reservations } from "@/db/schema";
import { parseIcs } from "@/lib/ical/parse";

export async function runIcalSync(): Promise<
  { success: true; bookingsSynced: number; villasSynced: number } | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, icalUrl: villas.icalUrl })
    .from(villas)
    .where(isNotNull(villas.icalUrl));

  const targets = rows.filter((v): v is { id: string; icalUrl: string } => Boolean(v.icalUrl));

  if (targets.length === 0) {
    return { success: false, error: "Aucune villa n'a de lien iCal configuré." };
  }

  let totalSynced = 0;

  try {
    for (const villa of targets) {
      const res = await fetch(villa.icalUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Le lien iCal a répondu ${res.status} pour une villa.`);
      }
      const raw = await res.text();
      const events = parseIcs(raw);

      for (const event of events) {
        const guestName = event.summary?.trim() || "Réservation iCal";

        const existing = await db
          .select({ id: reservations.id })
          .from(reservations)
          .where(eq(reservations.superhoteBookingId, event.uid))
          .limit(1);

        const values = {
          villaId: villa.id,
          superhoteBookingId: event.uid,
          guestName,
          checkIn: event.start,
          checkOut: event.end,
          status: "confirmee",
          source: "superhote" as const,
          rawData: { summary: event.summary },
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

    return { success: true, bookingsSynced: totalSynced, villasSynced: targets.length };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inattendue lors de la synchronisation iCal.",
    };
  }
}
