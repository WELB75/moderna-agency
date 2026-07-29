"use server";

import { auth } from "@clerk/nextjs/server";
import { ilike, or, eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas, domaines, interventions, maintenanceRecords, personnel } from "@/db/schema";
import { domaineEstActif } from "@/lib/domaines-actifs";

export type SearchResult = {
  type: "reservation" | "intervention" | "maintenance" | "personnel";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const RESULTS_PAR_TYPE = 8;

// Recherche unique sur tout l'historique (pas seulement la semaine affichée à l'accueil) :
// client depuis le début, travaux (interventions + entretiens), et personnel ménage/cuisine.
export async function searchGlobal(query: string): Promise<SearchResult[]> {
  await auth.protect();
  const q = query.trim();
  if (q.length < 2) return [];
  const db = getDb();
  const like = `%${q}%`;

  const [reservationRows, interventionRows, maintenanceRows, personnelRows] = await Promise.all([
    db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(ilike(reservations.guestName, like))
      .orderBy(desc(reservations.checkIn))
      .limit(RESULTS_PAR_TYPE * 2),
    db
      .select({
        id: interventions.id,
        titre: interventions.titre,
        prestataire: interventions.prestataire,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(interventions)
      .leftJoin(villas, eq(interventions.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(or(ilike(interventions.titre, like), ilike(interventions.probleme, like), ilike(interventions.prestataire, like)))
      .orderBy(desc(interventions.signaleAt))
      .limit(RESULTS_PAR_TYPE * 2),
    db
      .select({
        id: maintenanceRecords.id,
        equipement: maintenanceRecords.equipement,
        villaNom: villas.nom,
        villaNumero: villas.numero,
        domaineNom: domaines.nom,
      })
      .from(maintenanceRecords)
      .leftJoin(villas, eq(maintenanceRecords.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(ilike(maintenanceRecords.equipement, like))
      .limit(RESULTS_PAR_TYPE * 2),
    db.select().from(personnel).where(ilike(personnel.nom, like)).limit(RESULTS_PAR_TYPE),
  ]);

  const results: SearchResult[] = [];

  for (const r of reservationRows.filter((r) => domaineEstActif(r.domaineNom)).slice(0, RESULTS_PAR_TYPE)) {
    results.push({
      type: "reservation",
      id: r.id,
      title: r.guestName,
      subtitle: `${r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"} · ${format(new Date(r.checkIn), "d MMM yyyy", { locale: fr })} → ${format(new Date(r.checkOut), "d MMM yyyy", { locale: fr })}`,
      href: `/reservations/${r.id}`,
    });
  }

  for (const i of interventionRows.filter((i) => domaineEstActif(i.domaineNom)).slice(0, RESULTS_PAR_TYPE)) {
    results.push({
      type: "intervention",
      id: i.id,
      title: i.titre,
      subtitle: `${i.villaNom ? `${i.villaNom} (n°${i.villaNumero})` : "Sans villa"}${i.prestataire ? ` · ${i.prestataire}` : ""}`,
      href: "/interventions",
    });
  }

  for (const m of maintenanceRows.filter((m) => domaineEstActif(m.domaineNom)).slice(0, RESULTS_PAR_TYPE)) {
    results.push({
      type: "maintenance",
      id: m.id,
      title: m.equipement,
      subtitle: m.villaNom ? `${m.villaNom} (n°${m.villaNumero})` : "Sans villa",
      href: "/maintenance",
    });
  }

  for (const p of personnelRows) {
    results.push({
      type: "personnel",
      id: p.id,
      title: p.nom,
      subtitle: p.role === "menage" ? "Femme de ménage" : "Cuisinière",
      href: `/personnel/${p.id}`,
    });
  }

  return results;
}
