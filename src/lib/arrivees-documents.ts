import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, gendarmerieOccupants, reservations, villas } from "@/db/schema";
import { villaEstGeree } from "@/lib/domaines-actifs";

// Arrivées à venir et état de leurs documents (fiche police, contrat, caution) — source commune
// des tuiles « Prochaines échéances » de l'accueil et du bloc « Fiche police, contrat et caution »
// (Fouad, 2026-10-31 : « un vrai compteur qu'on voit tout le temps »).
//
// 2026-10-31 : la fiche police n'est plus tout ou rien. Avec l'enregistrement voyageur par
// voyageur (lib/actions/gendarmerie.ts, enregistrerOccupantPublic), une fiche « en_attente » peut
// déjà contenir une partie des passeports : on renvoie donc aussi `occupantsRecus` / `occupantsAttendus`
// pour afficher « 2/4 » au staff.

// Pas de voyageur à suivre : blocages (assistant "Blocage · ...", dates fermées iCal, résas Beds24
// nommées "Blocage Airbnb"...) et séjours "Famille" (ni caution ni fiche police demandées) — même
// esprit que estBlocage/ficheRequise dans security-data.ts.
const NOM_SANS_VOYAGEUR = /^(blocage|date bloqu|not available|blocked|indisponible)/i;
export function arriveeASuivre(r: { canal: string | null; guestName: string }): boolean {
  const canal = r.canal ?? "";
  return !canal.startsWith("Blocage") && canal !== "Famille" && !NOM_SANS_VOYAGEUR.test(r.guestName.trim());
}

export type FicheArrivee = {
  id: string;
  statut: "complete" | "en_attente";
  occupantsRecus: number;
  occupantsAttendus: number | null;
};

export type ArriveeDocuments = {
  id: string;
  guestName: string;
  checkIn: Date;
  canal: string | null;
  caution: string | null;
  cautionPayee: boolean;
  nbAdultes: number | null;
  villaId: string | null;
  villaNom: string | null;
  villaType: "villa" | "appartement" | null;
  fiche: FicheArrivee | null;
  contrat: { id: string; statut: "signe" | "en_attente" } | null;
  ficheStatut: "complete" | "en_attente" | null;
  contratStatut: "signe" | "en_attente" | null;
};

export async function chargerArriveesDocuments(now: Date, nbJours: number): Promise<ArriveeDocuments[]> {
  const db = getDb();
  const debut = startOfDay(now);
  const fin = endOfDay(addDays(now, nbJours - 1));

  const arrivees = (
    await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        canal: reservations.canal,
        caution: reservations.caution,
        cautionPayee: reservations.cautionPayee,
        nbAdultes: reservations.nbAdultes,
        villaId: villas.id,
        villaNom: villas.nom,
        villaType: villas.type,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .where(and(ne(reservations.status, "annulee"), gte(reservations.checkIn, debut), lte(reservations.checkIn, fin)))
      .orderBy(asc(reservations.checkIn))
  ).filter((r) => villaEstGeree(r.villaNom) && arriveeASuivre(r));

  const ids = arrivees.map((r) => r.id);
  const villaIds = Array.from(new Set(arrivees.map((r) => r.villaId).filter((id): id is string => Boolean(id))));
  const [fiches, contrats] = await Promise.all([
    ids.length > 0
      ? db
          .select({
            id: gendarmerieForms.id,
            reservationId: gendarmerieForms.reservationId,
            statut: gendarmerieForms.statut,
            nbAdultesPrevu: gendarmerieForms.nbAdultesPrevu,
            occupants: sql<number>`(select count(*) from ${gendarmerieOccupants} where ${gendarmerieOccupants.formId} = ${gendarmerieForms.id})`.mapWith(Number),
          })
          .from(gendarmerieForms)
          .where(inArray(gendarmerieForms.reservationId, ids))
      : [],
    // Le contrat n'est pas lié à la réservation en base : rapproché par villa + date d'arrivée,
    // comme sur les cartes de l'agenda (dashboard/page.tsx).
    villaIds.length > 0
      ? db
          .select({ id: contratsLocation.id, villaId: contratsLocation.villaId, dateArrivee: contratsLocation.dateArrivee, statut: contratsLocation.statut })
          .from(contratsLocation)
          .where(inArray(contratsLocation.villaId, villaIds))
      : [],
  ]);

  const contratParVillaEtDate = new Map<string, { id: string; statut: "signe" | "en_attente" }>();
  for (const c of contrats) {
    if (!c.villaId || !c.dateArrivee) continue;
    const cle = `${c.villaId}|${c.dateArrivee}`;
    const actuel = contratParVillaEtDate.get(cle);
    if (c.statut === "signe" || actuel?.statut !== "signe") {
      contratParVillaEtDate.set(cle, { id: c.id, statut: c.statut === "signe" ? "signe" : "en_attente" });
    }
  }

  // Une fiche "complete" l'emporte sur une fiche en attente créée en double pour le même séjour ;
  // entre deux fiches en attente, celle qui a déjà reçu le plus de passeports.
  const ficheParResa = new Map<string, FicheArrivee & { nbAdultesPrevu: number | null }>();
  for (const f of fiches) {
    if (!f.reservationId) continue;
    const candidate = {
      id: f.id,
      statut: (f.statut === "complete" ? "complete" : "en_attente") as "complete" | "en_attente",
      occupantsRecus: f.occupants ?? 0,
      occupantsAttendus: null,
      nbAdultesPrevu: f.nbAdultesPrevu,
    };
    const actuelle = ficheParResa.get(f.reservationId);
    if (
      !actuelle ||
      (candidate.statut === "complete" && actuelle.statut !== "complete") ||
      (candidate.statut === actuelle.statut && candidate.occupantsRecus > actuelle.occupantsRecus)
    ) {
      ficheParResa.set(f.reservationId, candidate);
    }
  }

  return arrivees.map((r) => {
    const f = ficheParResa.get(r.id) ?? null;
    const fiche: FicheArrivee | null = f
      ? {
          id: f.id,
          statut: f.statut,
          occupantsRecus: f.occupantsRecus,
          occupantsAttendus: nombreAdultesAttendus({ nbAdultesPrevu: f.nbAdultesPrevu, nbAdultes: r.nbAdultes }),
        }
      : null;
    const cle = r.villaId ? `${r.villaId}|${format(r.checkIn, "yyyy-MM-dd")}` : null;
    const contrat = cle ? (contratParVillaEtDate.get(cle) ?? null) : null;
    return {
      ...r,
      fiche,
      contrat,
      ficheStatut: fiche?.statut ?? null,
      contratStatut: contrat?.statut ?? null,
    };
  });
}

// Nombre d'adultes attendus sur la fiche : le nombre que le voyageur a confirmé sur la fiche
// (nbAdultesPrevu, modifiable par lui), sinon celui de la réservation.
export function nombreAdultesAttendus(x: { nbAdultesPrevu: number | null; nbAdultes: number | null }): number | null {
  const n = x.nbAdultesPrevu ?? x.nbAdultes;
  return n && n > 0 ? n : null;
}

// Texte « 2/4 passeports » pour le staff ; null si rien à dire (fiche complète ou aucun reçu sans
// nombre attendu connu).
export function progressionFiche(fiche: FicheArrivee | null): string | null {
  if (!fiche || fiche.statut === "complete") return null;
  if (fiche.occupantsAttendus) return `${fiche.occupantsRecus}/${fiche.occupantsAttendus} passeports`;
  if (fiche.occupantsRecus > 0) return `${fiche.occupantsRecus} passeport${fiche.occupantsRecus > 1 ? "s" : ""} reçu${fiche.occupantsRecus > 1 ? "s" : ""}`;
  return null;
}
