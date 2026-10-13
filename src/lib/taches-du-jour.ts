import { and, asc, gte, inArray, lte, ne } from "drizzle-orm";
import { addDays } from "date-fns";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";

// Vue "Tâches du jour" du tableau de bord (disposition inspirée de SuperHote v2 : une ligne par
// tâche avec logement, statut d'assignation, dernier départ et prochaine arrivée). Kamel,
// 2026-10-13 : "ce genre de disposition dans le tableau de bord mais en ayant ces infos de notre
// app Moderna".

export type VoisinResa = {
  id: string;
  guestName: string;
  guestPhone: string | null;
  checkIn: Date;
  checkOut: Date;
  nbAdultes: number | null;
  nbEnfants: number | null;
};

// Réservations proches de chaque villa (30 jours avant / 90 après), triées par arrivée : sert à
// retrouver, pour une tâche donnée, le dernier départ et la prochaine arrivée de la villa.
export async function chargerVoisins(villaIds: string[], now: Date): Promise<Map<string, VoisinResa[]>> {
  const out = new Map<string, VoisinResa[]>();
  if (villaIds.length === 0) return out;
  const rows = await getDb()
    .select({
      villaId: reservations.villaId,
      id: reservations.id,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.villaId, villaIds),
        ne(reservations.status, "annulee"),
        gte(reservations.checkOut, addDays(now, -30)),
        lte(reservations.checkIn, addDays(now, 90))
      )
    )
    .orderBy(asc(reservations.checkIn));
  for (const r of rows) {
    if (!r.villaId) continue;
    const list = out.get(r.villaId) ?? [];
    list.push({ id: r.id, guestName: r.guestName, guestPhone: r.guestPhone, checkIn: r.checkIn, checkOut: r.checkOut, nbAdultes: r.nbAdultes, nbEnfants: r.nbEnfants });
    out.set(r.villaId, list);
  }
  return out;
}

// Dernier départ (départ le plus récent <= ref) et prochaine arrivée (arrivée la plus proche >= ref).
export function voisinsAutour(liste: VoisinResa[], ref: Date): { dernierDepart: VoisinResa | null; prochaineArrivee: VoisinResa | null } {
  const t = ref.getTime();
  let dernierDepart: VoisinResa | null = null;
  let prochaineArrivee: VoisinResa | null = null;
  for (const r of liste) {
    if (r.checkOut.getTime() <= t && (!dernierDepart || r.checkOut > dernierDepart.checkOut)) dernierDepart = r;
    if (r.checkIn.getTime() >= t && (!prochaineArrivee || r.checkIn < prochaineArrivee.checkIn)) prochaineArrivee = r;
  }
  return { dernierDepart, prochaineArrivee };
}

