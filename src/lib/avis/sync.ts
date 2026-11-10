import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { Beds24ConfigError, beds24GetAirbnbReviews, beds24GetBookingReviews } from "@/lib/beds24/client";
import { assurerTableAvis, enregistrerAvis } from "@/lib/avis/db";
import { normaliserAvisAirbnb, normaliserAvisBooking } from "@/lib/avis/normaliser";

export type ResultatSyncAvis = {
  success: boolean;
  airbnb: { logements: number; avis: number; ignores: number };
  booking: { logements: number; avis: number; ignores: number };
  erreurs: string[];
};

// Récupère les avis Airbnb (par chambre Beds24) et Booking.com (par propriété) de tous les
// logements reliés à Beds24, puis les enregistre. Les endpoints Beds24 sont en bêta/alpha : une
// erreur sur un logement est notée et n'arrête pas les autres. Premier passage : tout l'historique ;
// ensuite un an glissant côté Booking.com (les réponses et masquages sont remis à jour).
export async function synchroniserAvis(): Promise<ResultatSyncAvis> {
  const resultat: ResultatSyncAvis = {
    success: true,
    airbnb: { logements: 0, avis: 0, ignores: 0 },
    booking: { logements: 0, avis: 0, ignores: 0 },
    erreurs: [],
  };
  const db = getDb();
  await assurerTableAvis();

  const logements = await db
    .select({ id: villas.id, nom: villas.nom, roomId: villas.beds24RoomId, propertyId: villas.beds24PropertyId })
    .from(villas)
    .where(isNotNull(villas.beds24RoomId));

  const dejaConnus = new Set(
    (((await db.execute(sql`SELECT DISTINCT villa_id FROM avis_plateformes WHERE villa_id IS NOT NULL`)) as unknown as { rows?: { villa_id: string }[] }).rows ?? []).map((r) => r.villa_id)
  );
  const il_y_a_un_an = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  // Un logement à la fois : le quota Beds24 se compte sur 5 minutes (voir beds24GetMessagesBulk).
  for (const l of logements) {
    try {
      if (l.roomId) {
        resultat.airbnb.logements++;
        for (const brut of await beds24GetAirbnbReviews(Number(l.roomId))) {
          const a = normaliserAvisAirbnb(brut);
          if (!a) {
            resultat.airbnb.ignores++;
            continue;
          }
          await enregistrerAvis(l.id, null, a);
          resultat.airbnb.avis++;
        }
      }
    } catch (e) {
      if (e instanceof Beds24ConfigError) return { ...resultat, success: false, erreurs: [e.message] };
      resultat.erreurs.push(`Airbnb ${l.nom} : ${e instanceof Error ? e.message.slice(0, 160) : "erreur"}`);
    }

    try {
      if (l.propertyId) {
        resultat.booking.logements++;
        const depuis = dejaConnus.has(l.id) ? il_y_a_un_an : "2015-01-01";
        for (const brut of await beds24GetBookingReviews(Number(l.propertyId), depuis)) {
          const a = normaliserAvisBooking(brut);
          if (!a) {
            resultat.booking.ignores++;
            continue;
          }
          // Rattachement au séjour : le numéro de réservation Booking.com est conservé par Beds24
          // (beds24ApiReference) dans les données de la réservation.
          let reservationId: string | null = null;
          if (a.reservationRef) {
            const [r] = await db
              .select({ id: reservations.id })
              .from(reservations)
              .where(and(eq(reservations.villaId, l.id), sql`${reservations.rawData}->>'beds24ApiReference' = ${a.reservationRef}`))
              .limit(1);
            reservationId = r?.id ?? null;
          }
          await enregistrerAvis(l.id, reservationId, a);
          resultat.booking.avis++;
        }
      }
    } catch (e) {
      if (e instanceof Beds24ConfigError) return { ...resultat, success: false, erreurs: [e.message] };
      resultat.erreurs.push(`Booking ${l.nom} : ${e instanceof Error ? e.message.slice(0, 160) : "erreur"}`);
    }
  }
  resultat.success = resultat.erreurs.length < logements.length * 2 || logements.length === 0;
  return resultat;
}
