import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { getDb } from "@/db";
import { contratsLocation, gendarmerieForms, gendarmerieOccupants, reservations, villas } from "@/db/schema";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { sejourSansVoyageur } from "@/lib/conditions-sejour";

// Arrivées à venir et état de leurs documents (fiche police, contrat, caution) — source commune
// des tuiles « Prochaines échéances » de l'accueil et du bloc « Fiche police, contrat et caution »
// (Fouad, 2026-10-31 : « un vrai compteur qu'on voit tout le temps »).
//
// 2026-10-31 : la fiche police n'est plus tout ou rien. Avec l'enregistrement voyageur par
// voyageur (lib/actions/gendarmerie.ts, enregistrerOccupantPublic), une fiche « en_attente » peut
// déjà contenir une partie des passeports : on renvoie donc aussi `occupantsRecus` / `occupantsAttendus`
// pour afficher « 2/4 » au staff.

// Pas de voyageur à suivre : blocages (assistant "Blocage · ...", dates fermées iCal, résas Beds24
// nommées "Blocage Airbnb" ou "Travaux ...") et séjours du propriétaire. Les séjours « Famille »
// sont suivis, eux (Kamel, 2026-11-01 : « travaux et propriétaire on n'a pas besoin, mais famille
// tu mets ») : la fiche police est demandée, pas le contrat (voir `contratRequis`).
export function estSejourFamille(canal: string | null): boolean {
  return canal === "Famille";
}
export function arriveeASuivre(r: { canal: string | null; guestName: string }): boolean {
  return !sejourSansVoyageur({ canal: estSejourFamille(r.canal) ? null : r.canal, guestName: r.guestName });
}

export type FicheArrivee = {
  id: string;
  statut: "complete" | "en_attente";
  occupantsRecus: number;
  occupantsAttendus: number | null;
  // Passeports d'enfants (photos, pas de fiche) : reçus / annoncés. Kamel, 2026-11-01 : « il faut
  // qu'on ait les passeports de tout le monde » — la fiche n'est verte que quand ils sont là.
  enfantsRecus: number;
  enfantsAttendus: number;
};

export type ArriveeDocuments = {
  id: string;
  guestName: string;
  checkIn: Date;
  canal: string | null;
  caution: string | null;
  cautionPayee: boolean;
  nbAdultes: number | null;
  // Le bouton « Message d'arrivée » (qui embarque le lien de la fiche police) a été utilisé.
  ficheEnvoyee: boolean;
  villaId: string | null;
  villaNom: string | null;
  villaType: "villa" | "appartement" | null;
  fiche: FicheArrivee | null;
  contrat: { id: string; statut: "signe" | "en_attente" } | null;
  // Faux pour un séjour Famille : pas de conditions de séjour à signer, donc `contratStatut` y est
  // traité comme réglé (« signe ») pour que l'échéance ne dépende que de la fiche police.
  contratRequis: boolean;
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
        nbEnfants: reservations.nbEnfants,
        messageArriveeEnvoyeAt: reservations.messageArriveeEnvoyeAt,
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
            nbEnfantsPrevu: gendarmerieForms.nbEnfantsPrevu,
            enfantsRecus: sql<number>`jsonb_array_length(coalesce(${gendarmerieForms.enfantsPassportUrls}, '[]'::jsonb))`.mapWith(Number),
            occupants: sql<number>`count(${gendarmerieOccupants.id})`.mapWith(Number),
          })
          .from(gendarmerieForms)
          // Passeports reçus comptés par jointure + group by, pas par sous-requête : avec
          // `(select count(*) from occupants where form_id = ${gendarmerieForms.id})`, drizzle
          // rendait `"form_id" = "id"` sans préfixe de table, donc `id` était celui de l'occupant
          // → toujours 0 (Fouad, 2026-10-31 : « y a deux passeports déjà faits et sur la ligne y a
          // écrit 0/5 »).
          .leftJoin(gendarmerieOccupants, eq(gendarmerieOccupants.formId, gendarmerieForms.id))
          .where(inArray(gendarmerieForms.reservationId, ids))
          .groupBy(gendarmerieForms.id)
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
  const ficheParResa = new Map<string, FicheArrivee & { nbAdultesPrevu: number | null; nbEnfantsPrevu: number | null }>();
  for (const f of fiches) {
    if (!f.reservationId) continue;
    const candidate = {
      id: f.id,
      statut: (f.statut === "complete" ? "complete" : "en_attente") as "complete" | "en_attente",
      occupantsRecus: f.occupants ?? 0,
      occupantsAttendus: null,
      enfantsRecus: f.enfantsRecus ?? 0,
      enfantsAttendus: 0,
      nbAdultesPrevu: f.nbAdultesPrevu,
      nbEnfantsPrevu: f.nbEnfantsPrevu,
    };
    const actuelle = ficheParResa.get(f.reservationId);
    if (
      !actuelle ||
      (candidate.statut === "complete" && actuelle.statut !== "complete") ||
      (candidate.statut === actuelle.statut && candidate.occupantsRecus + candidate.enfantsRecus > actuelle.occupantsRecus + actuelle.enfantsRecus)
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
          enfantsRecus: f.enfantsRecus,
          enfantsAttendus: Math.max(0, f.nbEnfantsPrevu ?? r.nbEnfants ?? 0),
        }
      : null;
    const cle = r.villaId ? `${r.villaId}|${format(r.checkIn, "yyyy-MM-dd")}` : null;
    const contrat = cle ? (contratParVillaEtDate.get(cle) ?? null) : null;
    const { messageArriveeEnvoyeAt, ...resa } = r;
    return {
      ...resa,
      ficheEnvoyee: Boolean(messageArriveeEnvoyeAt),
      fiche,
      contrat,
      // Statut d'affichage : « complete » en base dès que les adultes sont là (la sécurité est
      // prévenue à ce moment), mais pas « faite » pour le staff tant qu'il manque un passeport d'enfant.
      ficheStatut: fiche ? (ficheToutRecue(fiche) ? "complete" : "en_attente") : null,
      contratRequis: !estSejourFamille(r.canal),
      contratStatut: estSejourFamille(r.canal) ? "signe" : (contrat?.statut ?? null),
    };
  });
}

// Nombre d'adultes attendus sur la fiche : le nombre que le voyageur a confirmé sur la fiche
// (nbAdultesPrevu, modifiable par lui), sinon celui de la réservation.
export function nombreAdultesAttendus(x: { nbAdultesPrevu: number | null; nbAdultes: number | null }): number | null {
  const n = x.nbAdultesPrevu ?? x.nbAdultes;
  return n && n > 0 ? n : null;
}

// Passeports d'enfants encore manquants (0 si tout est reçu ou si aucun enfant n'est annoncé).
export function enfantsManquants(fiche: FicheArrivee): number {
  return Math.max(0, fiche.enfantsAttendus - fiche.enfantsRecus);
}

// Fiche terminée pour le staff : adultes enregistrés (statut « complete » en base) ET passeports
// des enfants annoncés tous reçus.
export function ficheToutRecue(fiche: FicheArrivee): boolean {
  return fiche.statut === "complete" && enfantsManquants(fiche) === 0;
}

// Texte « 2/4 passeports » pour le staff (adultes + enfants) ; null si rien à dire (fiche terminée
// ou aucun reçu sans nombre attendu connu).
export function progressionFiche(fiche: FicheArrivee | null): string | null {
  if (!fiche || ficheToutRecue(fiche)) return null;
  const enfantsRecus = Math.min(fiche.enfantsRecus, fiche.enfantsAttendus);
  const recus = fiche.occupantsRecus + enfantsRecus;
  if (fiche.occupantsAttendus) return `${recus}/${fiche.occupantsAttendus + fiche.enfantsAttendus} passeports`;
  if (recus > 0) return `${recus} passeport${recus > 1 ? "s" : ""} reçu${recus > 1 ? "s" : ""}`;
  return null;
}
