import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas, pricelabsPriceCache } from "@/db/schema";
import { beds24GetCalendar } from "@/lib/beds24/client";

// Disponibilité d'un logement, en temps réel : une nuit est indisponible si une réservation de
// l'app la couvre, si Beds24 (calendrier envoyé à Airbnb/Booking.com) la ferme (numAvail = 0), ou
// si PriceLabs la marque non réservable. Kamel, 2026-10-14 : "il doit être connecté en temps réel
// au calendrier, donc si on choisit une date et que c'est pas dispo ça sera impossible à réserver".
//
// Une nuit = la date du jour d'arrivée jusqu'à la veille du départ : le jour du départ d'un séjour
// reste donc libre pour une arrivée (turnover le même jour).

export type Indisponibilites = {
  nuits: string[]; // YYYY-MM-DD
  tempsReel: boolean; // false si Beds24 n'a pas répondu (réservations + cache PriceLabs seulement)
};

function jourISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nuitsDeSejour(checkIn: Date, checkOut: Date): string[] {
  const out: string[] = [];
  const fin = new Date(Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate()));
  for (
    const c = new Date(Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate()));
    c < fin;
    c.setUTCDate(c.getUTCDate() + 1)
  ) {
    out.push(jourISO(c));
  }
  return out;
}

function avecTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// from / to : YYYY-MM-DD (to exclu). `ignorerReservationId` pour une future modification de séjour.
export async function indisponibilites(villaId: string, from: string, to: string, ignorerReservationId?: string): Promise<Indisponibilites> {
  const db = getDb();
  const bloquees = new Set<string>();

  const debut = new Date(`${from}T00:00:00Z`);
  const fin = new Date(`${to}T00:00:00Z`);

  // 1. Réservations de l'app (toutes sources, sauf annulées).
  const resas = await db
    .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(and(eq(reservations.villaId, villaId), ne(reservations.status, "annulee"), lt(reservations.checkIn, fin), gt(reservations.checkOut, debut)));
  for (const r of resas) {
    if (r.id === ignorerReservationId) continue;
    for (const n of nuitsDeSejour(new Date(r.checkIn), new Date(r.checkOut))) bloquees.add(n);
  }

  // 2. Cache PriceLabs (nuits non réservables).
  const [cache] = await db
    .select({ days: pricelabsPriceCache.days })
    .from(pricelabsPriceCache)
    .where(eq(pricelabsPriceCache.villaId, villaId))
    .limit(1);
  for (const d of (cache?.days as { date: string; unbookable: boolean }[] | undefined) ?? []) {
    if (d.unbookable) bloquees.add(d.date);
  }

  // 3. Calendrier Beds24 en direct (reflète Airbnb/Booking.com et nos blocages).
  let tempsReel = false;
  const [villa] = await db.select({ roomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, villaId)).limit(1);
  if (villa?.roomId) {
    try {
      const veille = new Date(fin);
      veille.setUTCDate(veille.getUTCDate() - 1);
      const jours = await avecTimeout(beds24GetCalendar(Number(villa.roomId), from, jourISO(veille)), 9000);
      for (const j of jours) if (j.numAvail === 0) bloquees.add(j.date);
      tempsReel = true;
    } catch (err) {
      console.error("[disponibilite] calendrier Beds24 indisponible:", err instanceof Error ? err.message : err);
    }
  }

  return { nuits: [...bloquees].filter((n) => n >= from && n < to).sort(), tempsReel };
}

// Nuits indisponibles dans [checkIn, checkOut) — vide si le séjour est possible.
export async function conflitsSejour(villaId: string, checkIn: string, checkOut: string): Promise<{ conflits: string[]; tempsReel: boolean }> {
  const from = checkIn.slice(0, 10);
  const to = checkOut.slice(0, 10);
  const { nuits, tempsReel } = await indisponibilites(villaId, from, to);
  return { conflits: nuits, tempsReel };
}
