import { revalidateTag, unstable_cache } from "next/cache";
import { and, gte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";

// Pourquoi ce module existe (incident Neon du 25 octobre 2026) :
// les flux /api/ical/export/[villaId] sont relus par un robot externe environ une fois par
// minute et par villa (une quinzaine de villas). Chaque lecture faisait sa propre requête SQL,
// donc le compute Neon ne se mettait jamais en veille : ~370 h d'affilée entre le 8 et le 23
// octobre, 110 CU-h consommées sur les 100 CU-h/mois du plan Free → base suspendue (HTTP 402)
// jusqu'au 1er novembre. Le cache CDN ajouté le 23 octobre (s-maxage) réduit les exécutions de
// fonction mais pas assez les réveils de la base : avec 15 villas, le CDN expire un flux toutes
// les ~40 s en moyenne, et Neon a besoin de 5 min de silence complet pour s'endormir.
//
// Ici, UNE seule lecture en base, commune à toutes les villas et à toutes les variantes
// (?for=airbnb|booking), conservée dans le Data Cache de Vercel (partagé entre régions et
// invocations) et rafraîchie au plus toutes les ICAL_REVALIDATE_SECONDS. Le filtrage par villa
// et par source se fait ensuite en mémoire. Résultat : au plus 48 réveils de Neon par jour pour
// l'iCal (≈ 1 CU-h/jour, ≈ 30 CU-h/mois) au lieu d'un compute allumé 24 h/24 (≈ 180 CU-h/mois).

/** Tag de cache : à révoquer via invalidateIcalExport() après création/modification d'une réservation. */
export const ICAL_CACHE_TAG = "ical-export";

/**
 * Fraîcheur maximale côté base. Chaque réveil de Neon coûte au minimum 5 min × 0,25 CU.
 * 30 min = ≤ 48 réveils/jour ; passer à 60 × 60 divise encore ce coût par deux si besoin.
 * Les dates sont fermées en direct via Beds24 : l'iCal n'est qu'un filet de sécurité.
 */
export const ICAL_REVALIDATE_SECONDS = 30 * 60;

export type IcalReservation = {
  id: string;
  villaId: string;
  /** ISO 8601 — le Data Cache sérialise en JSON, on ne transporte donc jamais d'objet Date. */
  checkIn: string;
  checkOut: string;
  guestName: string | null;
  notes: string | null;
  source: string | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function loadUpcomingReservations(): Promise<IcalReservation[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      guestName: reservations.guestName,
      notes: reservations.notes,
      source: reservations.source,
    })
    .from(reservations)
    .where(and(ne(reservations.status, "annulee"), gte(reservations.checkOut, new Date())))
    .orderBy(reservations.checkIn);

  return rows.map((r) => ({
    id: String(r.id),
    villaId: String(r.villaId),
    checkIn: toIso(r.checkIn),
    checkOut: toIso(r.checkOut),
    guestName: r.guestName ?? null,
    notes: r.notes ?? null,
    source: r.source ?? null,
  }));
}

/**
 * Réservations à venir (toutes villas confondues), lues au plus une fois par
 * ICAL_REVALIDATE_SECONDS pour l'ensemble du projet. Après expiration, la première lecture
 * sert encore la copie périmée et relance la requête en arrière-plan (stale-while-revalidate).
 */
export const getUpcomingReservationsForIcal = unstable_cache(
  loadUpcomingReservations,
  ["ical-export", "upcoming-reservations", "v1"],
  { revalidate: ICAL_REVALIDATE_SECONDS, tags: [ICAL_CACHE_TAG] }
);

/**
 * Optionnel : à appeler dans les Server Actions / routes qui créent, modifient ou annulent une
 * réservation, pour que le flux iCal reflète le changement dès la prochaine lecture au lieu
 * d'attendre jusqu'à 30 min. Coûte un réveil de base supplémentaire par appel, donc à réserver
 * aux vraies modifications de dates/statut.
 */
export function invalidateIcalExport() {
  revalidateTag(ICAL_CACHE_TAG, "max");
}
