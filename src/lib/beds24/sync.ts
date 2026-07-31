import { and, eq, isNotNull, gte, notInArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations } from "@/db/schema";
import { beds24GetBookings, beds24WriteBookings, type Beds24Booking, type Beds24BookingWrite } from "@/lib/beds24/client";
import { nowInMorocco } from "@/lib/now";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { toTitleCase } from "@/lib/utils";

// Réservations vraiment actives côté Beds24 ; "request"/"inquiry"/"black" ne sont pas des
// séjours réels (demande en attente, blocage manuel) et ne doivent pas apparaître dans l'app.
const ACTIVE_STATUSES = new Set(["confirmed", "new"]);
const CANCELLED_STATUSES = new Set(["cancelled"]);

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

function mapCanal(booking: Beds24Booking): string | null {
  if (!booking.channel || booking.channel === "direct") return "Direct";
  return booking.channel;
}

// Ne synchronise que les villas explicitement migrées vers Beds24 (beds24RoomId renseigné) —
// tant qu'une villa n'a pas ce champ, elle continue de fonctionner exactement comme aujourd'hui
// (iCal Superhote), cette fonction n'y touche pas.
export async function runBeds24Sync(): Promise<
  | { success: true; bookingsSynced: number; villasSynced: number; bookingsCancelled: number }
  | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, nom: villas.nom, beds24RoomId: villas.beds24RoomId })
    .from(villas)
    .where(isNotNull(villas.beds24RoomId));

  const targets = rows.filter((v): v is { id: string; nom: string; beds24RoomId: string } => Boolean(v.beds24RoomId));

  if (targets.length === 0) {
    return { success: false, error: "Aucune villa n'est encore connectée à Beds24." };
  }

  let totalSynced = 0;
  let totalCancelled = 0;
  const now = nowInMorocco();
  const newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[] = [];
  const cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[] = [];

  try {
    for (const villa of targets) {
      const roomId = Number(villa.beds24RoomId);
      const bookings = await beds24GetBookings({ roomId });
      const seenIds: string[] = [];

      for (const booking of bookings) {
        const bookingId = String(booking.id);
        const isCancelled = CANCELLED_STATUSES.has(booking.status);
        if (!isCancelled && !ACTIVE_STATUSES.has(booking.status)) continue; // demande/blocage, pas un vrai séjour

        seenIds.push(bookingId);
        const guestName = toTitleCase(`${booking.firstName ?? ""} ${booking.lastName ?? ""}`.trim() || "Réservation Beds24");
        const checkIn = toDateTime(booking.arrival, DEFAULT_CHECKIN_HOUR);
        const checkOut = toDateTime(booking.departure, DEFAULT_CHECKOUT_HOUR);

        const existing = await db
          .select({ id: reservations.id })
          .from(reservations)
          .where(eq(reservations.beds24BookingId, bookingId))
          .limit(1);

        const values = {
          villaId: villa.id,
          beds24BookingId: bookingId,
          guestName,
          guestEmail: booking.email || null,
          checkIn,
          checkOut,
          nbAdultes: booking.numAdult ?? null,
          nbEnfants: booking.numChild ?? null,
          guestsCount: (booking.numAdult ?? 0) + (booking.numChild ?? 0) || null,
          canal: mapCanal(booking),
          status: isCancelled ? ("annulee" as const) : ("confirmee" as const),
          source: "beds24" as const,
          loyerTotal: booking.price ? booking.price.toFixed(2) : null,
          rawData: { beds24Status: booking.status },
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(reservations).set(values).where(eq(reservations.id, existing[0].id));
        } else {
          await db.insert(reservations).values(values);
          if (!isCancelled) newBookings.push({ villaNom: villa.nom, guestName, checkIn, checkOut });
        }
        totalSynced += 1;
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

    return { success: true, bookingsSynced: totalSynced, villasSynced: targets.length, bookingsCancelled: totalCancelled };
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
