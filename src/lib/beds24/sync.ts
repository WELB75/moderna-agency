import { and, eq, isNotNull, isNull, gte, lt, inArray, notInArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations } from "@/db/schema";
import { beds24GetBookings, beds24WriteBookings, type Beds24Booking, type Beds24BookingWrite } from "@/lib/beds24/client";
import { nowInMorocco } from "@/lib/now";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";

// Réservations vraiment actives côté Beds24 ; "request"/"inquiry"/"black" ne sont pas des
// séjours réels (demande en attente, blocage manuel) et ne doivent pas apparaître dans l'app.
const ACTIVE_STATUSES = new Set(["confirmed", "new"]);
const CANCELLED_STATUSES = new Set(["cancelled"]);

// Sans filtre de date, GET /bookings ne renvoie que les séjours en cours/à venir : on remonte
// aussi les séjours terminés depuis moins de 30 jours (ménage, caution, fiche police...).
const PAST_DAYS_INCLUDED = 30;

// Sources des réservations importées par les anciennes synchros iCal (SuperHote, flux natifs
// Airbnb/Booking.com) : à la bascule, la même réservation remonte maintenant par Beds24. On
// rattache alors la ligne existante (voir findPreBeds24Duplicate) au lieu d'en créer une seconde.
// Jamais "manuel" : une résa Direct saisie dans l'app ne fait que bloquer le calendrier Beds24.
const PRE_BEDS24_SOURCES = ["superhote", "airbnb", "booking"];

// Beds24 ne donne qu'une date (pas d'heure) pour l'arrivée/le départ : on retombe sur les
// horaires standards de l'agence, modifiables ensuite comme pour toute autre réservation.
const DEFAULT_CHECKIN_HOUR = 15;
const DEFAULT_CHECKOUT_HOUR = 11;

// Construit la date explicitement via Date.UTC plutôt qu'un parsing de chaîne (dont le résultat
// dépend du fuseau horaire de la machine qui exécute le code) — même logique que nowInMorocco() :
// l'heure "affichée" (Maroc) est stockée telle quelle, sans conversion de fuseau.
function toDateTime(dateOnly: string, hour: number): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Canal normalisé sur les libellés déjà utilisés dans l'app ("Airbnb", "Booking.com", "Direct",
// reconnus par platformFromCanal). Beds24 expose un code technique (channel : "airbnb",
// "booking"...) et un libellé (referer : "Airbnb", "Booking.com"...), parfois l'un sans l'autre.
// On ne cherche pas "booking" seul dans referer : "Beds24 booking page" est une résa directe.
function mapCanal(booking: Beds24Booking): string {
  const channel = (booking.channel ?? "").trim().toLowerCase();
  const referer = (booking.referer ?? "").trim();
  const refererLower = referer.toLowerCase();

  if (channel.includes("airbnb") || refererLower.includes("airbnb")) return "Airbnb";
  if (channel === "booking" || channel === "bookingcom" || channel.includes("booking.com") || refererLower.includes("booking.com")) {
    return "Booking.com";
  }
  if (!channel || channel === "direct") return "Direct";
  // Autre OTA (Vrbo, Expedia...) : on garde le libellé Beds24 tel quel.
  return referer || booking.channel || "Direct";
}

function mapPhone(booking: Beds24Booking): string | null {
  const phone = (booking.mobile || booking.phone || "").trim();
  return phone || null;
}

// Ligne existante (importée avant la bascule) correspondant au même séjour : même villa, mêmes
// jours d'arrivée et de départ, pas encore rattachée à Beds24.
async function findPreBeds24Duplicate(villaId: string, booking: Beds24Booking) {
  const db = getDb();
  const arrivalStart = toDateTime(booking.arrival, 0);
  const departureStart = toDateTime(booking.departure, 0);
  const [row] = await db
    .select({
      id: reservations.id,
      guestPhone: reservations.guestPhone,
      guestEmail: reservations.guestEmail,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestsCount: reservations.guestsCount,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villaId),
        isNull(reservations.beds24BookingId),
        inArray(reservations.source, PRE_BEDS24_SOURCES),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkIn, arrivalStart),
        lt(reservations.checkIn, new Date(arrivalStart.getTime() + DAY_MS)),
        gte(reservations.checkOut, departureStart),
        lt(reservations.checkOut, new Date(departureStart.getTime() + DAY_MS))
      )
    )
    .limit(1);
  return row ?? null;
}

// Ne synchronise que les villas explicitement migrées vers Beds24 (beds24RoomId renseigné) —
// tant qu'une villa n'a pas ce champ, elle continue de fonctionner exactement comme avant
// (iCal Superhote), cette fonction n'y touche pas. Appelée par le bouton du tableau de bord, le
// webhook Beds24 (/api/beds24/webhook) et le cron quotidien (/api/beds24/sync).
export async function runBeds24Sync(): Promise<
  | { success: true; bookingsSynced: number; villasSynced: number; bookingsCancelled: number; bookingsAdopted: number }
  | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, beds24RoomId: villas.beds24RoomId })
    .from(villas)
    .where(isNotNull(villas.beds24RoomId));

  const targets = rows.filter(
    (v): v is { id: string; nom: string; numero: string; beds24RoomId: string } => Boolean(v.beds24RoomId)
  );

  if (targets.length === 0) {
    return { success: false, error: "Aucune villa n'est encore connectée à Beds24." };
  }

  let totalSynced = 0;
  let totalCancelled = 0;
  let totalAdopted = 0;
  const now = nowInMorocco();
  const departureFrom = new Date(now.getTime() - PAST_DAYS_INCLUDED * DAY_MS).toISOString().slice(0, 10);
  const newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[] = [];
  const cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[] = [];

  try {
    // Un seul appel (paginé) pour toutes les chambres connectées, plutôt qu'un appel par villa.
    const roomIds: number[] = Array.from(new Set(targets.map((v) => Number(v.beds24RoomId))));
    const allBookings = await beds24GetBookings({
      roomId: roomIds,
      departureFrom,
      status: ["new", "confirmed", "cancelled"],
    });
    const bookingsByRoom = new Map<number, Beds24Booking[]>();
    for (const booking of allBookings) {
      const list = bookingsByRoom.get(booking.roomId) ?? [];
      list.push(booking);
      bookingsByRoom.set(booking.roomId, list);
    }

    for (const villa of targets) {
      const bookings = bookingsByRoom.get(Number(villa.beds24RoomId)) ?? [];
      const seenIds: string[] = [];

      for (const booking of bookings) {
        const bookingId = String(booking.id);
        const isCancelled = CANCELLED_STATUSES.has(booking.status);
        if (!isCancelled && !ACTIVE_STATUSES.has(booking.status)) continue; // demande/blocage, pas un vrai séjour

        seenIds.push(bookingId);
        const guestName = toTitleCase(`${booking.firstName ?? ""} ${booking.lastName ?? ""}`.trim() || "Réservation Beds24");
        const checkIn = toDateTime(booking.arrival, DEFAULT_CHECKIN_HOUR);
        const checkOut = toDateTime(booking.departure, DEFAULT_CHECKOUT_HOUR);
        const guestPhone = mapPhone(booking);

        const values = {
          villaId: villa.id,
          beds24BookingId: bookingId,
          guestName,
          guestEmail: booking.email || null,
          guestPhone,
          checkIn,
          checkOut,
          nbAdultes: booking.numAdult ?? null,
          nbEnfants: booking.numChild ?? null,
          guestsCount: (booking.numAdult ?? 0) + (booking.numChild ?? 0) || null,
          canal: mapCanal(booking),
          status: isCancelled ? ("annulee" as const) : ("confirmee" as const),
          source: "beds24" as const,
          loyerTotal: booking.price ? booking.price.toFixed(2) : null,
          rawData: { beds24Status: booking.status, beds24Channel: booking.channel ?? null, beds24Referer: booking.referer ?? null },
          updatedAt: new Date(),
        };

        const [existing] = await db
          .select({ id: reservations.id, guestPhone: reservations.guestPhone })
          .from(reservations)
          .where(eq(reservations.beds24BookingId, bookingId))
          .limit(1);

        if (existing) {
          // Téléphone : comme pour la synchro iCal, un numéro corrigé à la main dans l'app ne
          // doit pas être écrasé par la valeur brute du canal — on ne fait que compléter.
          await db
            .update(reservations)
            .set({ ...values, guestPhone: existing.guestPhone ?? values.guestPhone })
            .where(eq(reservations.id, existing.id));
          totalSynced += 1;
          continue;
        }

        // Bascule SuperHote -> Beds24 : même séjour déjà importé par l'ancienne synchro iCal ?
        // On le rattache (en gardant ménage/cuisine déjà affectés, messages envoyés, etc.) au
        // lieu de créer un doublon. Les infos corrigées à la main (téléphone, nombre de
        // voyageurs, email) sont conservées, Beds24 ne fait que compléter les champs vides.
        const duplicate = isCancelled ? null : await findPreBeds24Duplicate(villa.id, booking);
        if (duplicate) {
          await db
            .update(reservations)
            .set({
              ...values,
              guestPhone: duplicate.guestPhone ?? values.guestPhone,
              guestEmail: duplicate.guestEmail ?? values.guestEmail,
              nbAdultes: duplicate.nbAdultes ?? values.nbAdultes,
              nbEnfants: duplicate.nbEnfants ?? values.nbEnfants,
              guestsCount: duplicate.guestsCount ?? values.guestsCount,
            })
            .where(eq(reservations.id, duplicate.id));
          totalAdopted += 1;
          totalSynced += 1;
          continue;
        }

        // onConflictDoNothing : le webhook peut déclencher deux synchros simultanées ; la
        // seconde ne doit ni planter sur l'index unique ni notifier deux fois.
        const [inserted] = await db
          .insert(reservations)
          .values(values)
          .onConflictDoNothing({ target: reservations.beds24BookingId })
          .returning({ id: reservations.id });
        totalSynced += 1;

        // Séjour déjà terminé (remonté par departureFrom) : pas de notification ni de ménage.
        if (!inserted || isCancelled || checkOut < now) continue;

        newBookings.push({ villaNom: villa.nom, guestName, checkIn, checkOut });
        // Sollicitation automatique d'une femme de ménage, comme pour la synchro iCal qu'on
        // remplace — ne doit jamais faire échouer la synchro elle-même si ça plante.
        try {
          await initiateMenageRequest(inserted.id, villa.nom, villa.numero, booking.departure);
        } catch (err) {
          console.error("Échec initiation demande ménage (sync Beds24):", err);
        }
      }

      // Réconciliation : une réservation encore "confirmée" à venir pour cette villa mais
      // absente de la réponse Beds24 actuelle a été annulée côté Beds24.
      const cancelledFilter = and(
        eq(reservations.villaId, villa.id),
        eq(reservations.source, "beds24"),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkOut, now),
        ...(seenIds.length > 0 ? [notInArray(reservations.beds24BookingId, seenIds)] : [])
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

    return {
      success: true,
      bookingsSynced: totalSynced,
      villasSynced: targets.length,
      bookingsCancelled: totalCancelled,
      bookingsAdopted: totalAdopted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inattendue lors de la synchronisation Beds24.";
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
      `Nouvelle réservation (Beds24) : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })} → ${format(b.checkOut, "d MMM", { locale: fr })})`
    );
  }
  for (const b of cancelledBookings) {
    lines.push(`Annulation (Beds24) : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })})`);
  }

  await notifyStaffWhatsApp(lines.join("\n")).catch(() => {});
}

// Sens app -> Beds24 : pousse une réservation créée/modifiée dans l'app vers Beds24, mais
// uniquement si sa villa est connectée (beds24RoomId renseigné) — ne fait rien sinon, donc sans
// aucun effet tant qu'aucune vraie villa n'est migrée.
export async function pushReservationToBeds24(reservationId: string): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      beds24BookingId: reservations.beds24BookingId,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      status: reservations.status,
      beds24RoomId: villas.beds24RoomId,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);

  if (!row || !row.beds24RoomId) return; // villa pas connectée à Beds24 : rien à faire

  const [firstName, ...rest] = row.guestName.split(" ");
  const write: Beds24BookingWrite = {
    id: row.beds24BookingId ? Number(row.beds24BookingId) : undefined,
    roomId: Number(row.beds24RoomId),
    status: row.status === "annulee" ? "cancelled" : "confirmed",
    arrival: format(row.checkIn, "yyyy-MM-dd"),
    departure: format(row.checkOut, "yyyy-MM-dd"),
    firstName,
    lastName: rest.join(" "),
    email: row.guestEmail || undefined,
    numAdult: row.nbAdultes ?? undefined,
  };

  const [result] = await beds24WriteBookings([write]);
  const newId = (result as { new?: { id: number } }).new?.id;
  if (newId && !row.beds24BookingId) {
    await db.update(reservations).set({ beds24BookingId: String(newId) }).where(eq(reservations.id, row.id));
  }
}
