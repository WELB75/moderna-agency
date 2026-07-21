import { and, eq, isNotNull, gte, notInArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations, superhoteSyncLog, ignoredBookings } from "@/db/schema";
import { parseIcs } from "@/lib/ical/parse";
import { nowInMorocco } from "@/lib/now";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";

export async function runIcalSync(): Promise<
  | { success: true; bookingsSynced: number; villasSynced: number; bookingsCancelled: number }
  | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, nom: villas.nom, icalUrl: villas.icalUrl })
    .from(villas)
    .where(isNotNull(villas.icalUrl));

  const targets = rows.filter(
    (v): v is { id: string; nom: string; icalUrl: string } => Boolean(v.icalUrl)
  );

  if (targets.length === 0) {
    return { success: false, error: "Aucune villa n'a de lien iCal configuré." };
  }

  const ignored = await db.select({ superhoteBookingId: ignoredBookings.superhoteBookingId }).from(ignoredBookings);
  const ignoredIds = new Set(ignored.map((i) => i.superhoteBookingId));

  let totalSynced = 0;
  let totalCancelled = 0;
  const now = nowInMorocco();
  const newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[] = [];
  const cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[] = [];

  try {
    for (const villa of targets) {
      const res = await fetch(villa.icalUrl, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Le lien iCal a répondu ${res.status} pour une villa.`);
      }
      const raw = await res.text();
      const events = parseIcs(raw);
      const seenBookingIds: string[] = [];

      for (const event of events) {
        // Les entrées "Blocked dates" (blocage manuel du calendrier, sans client réel)
        // n'ont ni email ni nom de logement dans la description : on les ignore.
        if (!event.description.guestEmail && !event.description.rentalName) continue;

        // Réservation explicitement bloquée (ex. erreur de villa dans le flux Superhote) :
        // on ne la marque même pas comme "vue", ce qui la fait passer automatiquement en
        // annulée par la réconciliation ci-dessous si elle existe encore en base.
        if (ignoredIds.has(event.stableBookingId)) continue;

        seenBookingIds.push(event.stableBookingId);
        const guestName = event.guestName?.trim() || event.summary?.trim() || "Réservation iCal";

        let existing = await db
          .select({ id: reservations.id })
          .from(reservations)
          .where(eq(reservations.superhoteBookingId, event.stableBookingId))
          .limit(1);

        // Repli : l'ancien UID Superhote (instable, régénéré à chaque export) a pu être
        // stocké lors d'une synchronisation précédente. On rattache alors la réservation
        // existante (même villa/dates) au nouvel identifiant stable au lieu d'en recréer une.
        if (existing.length === 0) {
          existing = await db
            .select({ id: reservations.id })
            .from(reservations)
            .where(
              and(
                eq(reservations.villaId, villa.id),
                eq(reservations.checkIn, event.start),
                eq(reservations.checkOut, event.end)
              )
            )
            .limit(1);
        }

        const values = {
          villaId: villa.id,
          superhoteBookingId: event.stableBookingId,
          guestName,
          guestEmail: event.description.guestEmail,
          guestPhone: event.description.guestPhone,
          checkIn: event.start,
          checkOut: event.end,
          nbAdultes: event.description.nbAdultes,
          nbEnfants: event.description.nbEnfants,
          guestsCount: (event.description.nbAdultes ?? 0) + (event.description.nbEnfants ?? 0) || null,
          canal: event.canal,
          status: "confirmee",
          source: "superhote" as const,
          rawData: { summary: event.summary },
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(reservations).set(values).where(eq(reservations.id, existing[0].id));
        } else {
          await db.insert(reservations).values(values);
          newBookings.push({ villaNom: villa.nom, guestName, checkIn: event.start, checkOut: event.end });
        }
        totalSynced += 1;
      }

      // Réconciliation : une réservation encore "confirmée" à venir pour cette villa mais
      // absente du flux iCal actuel a été annulée côté Superhote (le flux n'expose plus
      // que les réservations actives). On l'aligne sur cet état plutôt que de la garder
      // indéfiniment affichée comme confirmée.
      const cancelledFilter = and(
        eq(reservations.villaId, villa.id),
        eq(reservations.source, "superhote"),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkOut, now),
        ...(seenBookingIds.length > 0 ? [notInArray(reservations.superhoteBookingId, seenBookingIds)] : [])
      );

      const cancelled = await db
        .update(reservations)
        .set({ status: "annulee", updatedAt: new Date() })
        .where(cancelledFilter)
        .returning({ guestName: reservations.guestName, checkIn: reservations.checkIn });
      totalCancelled += cancelled.length;
      cancelled.forEach((c) => cancelledBookings.push({ villaNom: villa.nom, guestName: c.guestName, checkIn: c.checkIn }));
    }

    await notifySyncChanges(newBookings, cancelledBookings);

    await db.insert(superhoteSyncLog).values({
      startedAt: now,
      finishedAt: nowInMorocco(),
      success: true,
      bookingsSynced: totalSynced,
    });

    return { success: true, bookingsSynced: totalSynced, villasSynced: targets.length, bookingsCancelled: totalCancelled };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inattendue lors de la synchronisation iCal.";
    await db
      .insert(superhoteSyncLog)
      .values({ startedAt: now, finishedAt: nowInMorocco(), success: false, errorMessage: message })
      .catch(() => {});
    return { success: false, error: message };
  }
}

async function notifySyncChanges(
  newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[],
  cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[]
) {
  if (newBookings.length === 0 && cancelledBookings.length === 0) return;

  const lines: string[] = [];
  for (const b of newBookings) {
    lines.push(
      `Nouvelle réservation : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })} → ${format(b.checkOut, "d MMM", { locale: fr })})`
    );
  }
  for (const b of cancelledBookings) {
    lines.push(`Annulation : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })})`);
  }

  // Best-effort : un échec d'envoi WhatsApp ne doit jamais faire échouer la synchronisation.
  await notifyStaffWhatsApp(lines.join("\n")).catch(() => {});
}
