import { and, eq, isNotNull, gte, notInArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations, superhoteSyncLog, ignoredBookings, staffAssignmentRequests } from "@/db/schema";
import { parseIcs, parseGenericIcs } from "@/lib/ical/parse";
import { nowInMorocco } from "@/lib/now";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";

export async function runIcalSync(): Promise<
  | { success: true; bookingsSynced: number; villasSynced: number; bookingsCancelled: number }
  | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, icalUrl: villas.icalUrl })
    .from(villas)
    .where(isNotNull(villas.icalUrl));

  const targets = rows.filter(
    (v): v is { id: string; nom: string; numero: string; icalUrl: string } => Boolean(v.icalUrl)
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
        const guestName = toTitleCase(event.guestName?.trim() || event.summary?.trim() || "Réservation iCal");

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
          // Le nombre d'adultes/enfants de Superhote est souvent faux (rempli à la main par
          // le client) ; une fois corrigé manuellement (ex. via la fiche police), on ne veut
          // plus qu'une synchro suivante l'écrase avec la valeur d'origine. Même chose pour le
          // téléphone (Kamel, 2026-08-17) : Superhote exporte souvent un numéro local sans
          // indicatif clair ("0619031716", ambigu entre +33 et +212) — une fois corrigé à la
          // main dans l'app, un sync suivant l'écrasait avec la valeur brute d'origine.
          const updateValues = {
            villaId: values.villaId,
            superhoteBookingId: values.superhoteBookingId,
            guestName: values.guestName,
            guestEmail: values.guestEmail,
            checkIn: values.checkIn,
            checkOut: values.checkOut,
            canal: values.canal,
            status: values.status,
            source: values.source,
            rawData: values.rawData,
            updatedAt: values.updatedAt,
          };
          await db.update(reservations).set(updateValues).where(eq(reservations.id, existing[0].id));
        } else {
          const [inserted] = await db.insert(reservations).values(values).returning({ id: reservations.id });
          newBookings.push({ villaNom: villa.nom, guestName, checkIn: event.start, checkOut: event.end });
          // Sollicitation automatique d'une femme de ménage pour le nettoyage de fin de séjour
          // — ne doit jamais faire échouer la synchro elle-même si ça plante.
          try {
            await initiateMenageRequest(inserted.id, villa.nom, villa.numero, event.end.toISOString().slice(0, 10));
          } catch (err) {
            console.error("Échec initiation demande ménage (sync iCal):", err);
          }
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

// Synchronisation directe avec les flux iCal natifs Airbnb/Booking.com (gratuits, fournis par
// chaque plateforme depuis les paramètres de l'annonce) — remplace le besoin d'un channel manager
// pour le seul objectif qui compte ici : éviter les doubles réservations. Volontairement séparée
// de runIcalSync (format Superhote) : pas de nom/email/téléphone voyageur dans ces flux (anonymisés
// par les deux plateformes), donc pas de logique d'enrichissement à partager.
export async function runDirectPlatformSync(): Promise<{
  success: true;
  bookingsSynced: number;
  bookingsCancelled: number;
}> {
  const db = getDb();
  const now = nowInMorocco();
  const newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[] = [];
  const cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[] = [];
  let totalSynced = 0;
  let totalCancelled = 0;

  const targets = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      airbnbIcalUrl: villas.airbnbIcalUrl,
      bookingIcalUrl: villas.bookingIcalUrl,
    })
    .from(villas);

  for (const villa of targets) {
    for (const plat of [
      { key: "airbnb" as const, label: "Réservation Airbnb", canal: "Airbnb.com", url: villa.airbnbIcalUrl },
      { key: "booking" as const, label: "Réservation Booking.com", canal: "Booking.com", url: villa.bookingIcalUrl },
    ]) {
      if (!plat.url) continue;

      const res = await fetch(plat.url, { cache: "no-store" });
      if (!res.ok) {
        console.error(`Échec lecture iCal ${plat.key} pour ${villa.nom}:`, res.status);
        continue;
      }
      const events = parseGenericIcs(await res.text());
      const seenIds: string[] = [];
      // Une modification de réservation (ex. arrivée décalée d'un jour) fait qu'Airbnb/Booking.com
      // régénère un nouvel UID pour le même séjour : notre sync le lit comme "annulée + nouvelle",
      // ce qui perdrait sinon une éventuelle confirmation ménage/cuisine déjà obtenue. On relie les
      // deux via le départ (rarement modifié), voir report ci-dessous après la réconciliation.
      // Kamel, 2026-08-27 : découvert quand Nouhaila avait confirmé sur la réservation devenue
      // "annulée", pendant que la nouvelle continuait à solliciter du monde.
      const insertedByCheckout = new Map<string, string>();

      for (const event of events) {
        const stableId = `${plat.key}:${event.uid}`;
        seenIds.push(stableId);

        const existing = await db
          .select({ id: reservations.id })
          .from(reservations)
          .where(eq(reservations.superhoteBookingId, stableId))
          .limit(1);

        const values = {
          villaId: villa.id,
          superhoteBookingId: stableId,
          guestName: plat.label,
          checkIn: event.start,
          checkOut: event.end,
          canal: plat.canal,
          status: "confirmee" as const,
          source: plat.key,
          rawData: { summary: event.summary },
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db
            .update(reservations)
            .set({ checkIn: values.checkIn, checkOut: values.checkOut, status: values.status, updatedAt: values.updatedAt })
            .where(eq(reservations.id, existing[0].id));
        } else {
          const [inserted] = await db.insert(reservations).values(values).returning({ id: reservations.id });
          insertedByCheckout.set(event.end.toISOString().slice(0, 10), inserted.id);
          newBookings.push({ villaNom: villa.nom, guestName: plat.label, checkIn: event.start, checkOut: event.end });
          try {
            await initiateMenageRequest(inserted.id, villa.nom, villa.numero, event.end.toISOString().slice(0, 10));
          } catch (err) {
            console.error("Échec initiation demande ménage (sync directe):", err);
          }
        }
        totalSynced += 1;
      }

      const cancelledFilter = and(
        eq(reservations.villaId, villa.id),
        eq(reservations.source, plat.key),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkOut, now),
        ...(seenIds.length > 0 ? [notInArray(reservations.superhoteBookingId, seenIds)] : [])
      );
      const cancelled = await db
        .update(reservations)
        .set({ status: "annulee", updatedAt: new Date() })
        .where(cancelledFilter)
        .returning({ id: reservations.id, guestName: reservations.guestName, checkIn: reservations.checkIn, checkOut: reservations.checkOut });
      totalCancelled += cancelled.length;
      cancelled.forEach((c) => cancelledBookings.push({ villaNom: villa.nom, guestName: c.guestName, checkIn: c.checkIn }));

      for (const c of cancelled) {
        const replacementId = insertedByCheckout.get(c.checkOut.toISOString().slice(0, 10));
        if (!replacementId) continue;
        const confirmedRequests = await db
          .select({ role: staffAssignmentRequests.role, personnelConfirmeId: staffAssignmentRequests.personnelConfirmeId })
          .from(staffAssignmentRequests)
          .where(and(eq(staffAssignmentRequests.reservationId, c.id), eq(staffAssignmentRequests.statut, "confirme")));
        for (const req of confirmedRequests) {
          if (!req.personnelConfirmeId) continue;
          await db
            .insert(staffAssignmentRequests)
            .values({ reservationId: replacementId, role: req.role, statut: "confirme", personnelConfirmeId: req.personnelConfirmeId })
            .onConflictDoUpdate({
              target: [staffAssignmentRequests.reservationId, staffAssignmentRequests.role],
              set: { statut: "confirme", personnelConfirmeId: req.personnelConfirmeId, updatedAt: new Date() },
            });
        }
      }
    }
  }

  await notifySyncChanges(newBookings, cancelledBookings);
  return { success: true, bookingsSynced: totalSynced, bookingsCancelled: totalCancelled };
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
