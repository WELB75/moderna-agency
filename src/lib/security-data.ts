import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, domaines, reservations, contratsLocation } from "@/db/schema";
import { formatDateFr } from "@/lib/format-date";
import { nowInMorocco } from "@/lib/now";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

// Pour l'instant, la sécurité ne concerne que les villas (pas les appartements Noria) :
// chaque domaine a ses propres agents, il ne faut jamais mélanger les deux.
const DOMAINES_SECURITE = ["Domaine Zaraba", "Domaine Moderna II"];

async function buildVillaSecurityData(
  db: ReturnType<typeof getDb>,
  villa: { id: string; nom: string; numero: string }
): Promise<VillaSecurityData> {
  const allForms = await db
    .select({
      id: gendarmerieForms.id,
      reservationId: gendarmerieForms.reservationId,
      createdAt: gendarmerieForms.createdAt,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      contratDateArrivee: contratsLocation.dateArrivee,
      contratDateDepart: contratsLocation.dateDepart,
      contratNbAdultes: contratsLocation.nbAdultes,
      contratNbEnfants: contratsLocation.nbEnfants,
      enfantsPassportUrls: gendarmerieForms.enfantsPassportUrls,
    })
    .from(gendarmerieForms)
    .leftJoin(reservations, eq(gendarmerieForms.reservationId, reservations.id))
    .leftJoin(contratsLocation, eq(gendarmerieForms.contratId, contratsLocation.id))
    .where(and(eq(gendarmerieForms.villaId, villa.id), eq(gendarmerieForms.statut, "complete")))
    .orderBy(desc(gendarmerieForms.completedAt));

  const form = allForms[0];

  // Un Bulletin Individuel est rempli par une seule personne : quand plusieurs adultes
  // séjournent ensemble, l'équipe génère un lien distinct par adulte (generateGendarmerieForms),
  // tous créés dans le même insert (même createdAt). Si on ne gardait que la toute dernière
  // fiche complétée, on ne verrait qu'un seul adulte du groupe — on regroupe donc ici toutes
  // les fiches de ce même lot pour retrouver tout le monde.
  const formGroup =
    form && !form.reservationId
      ? allForms.filter(
          (f) => !f.reservationId && f.createdAt.getTime() === form.createdAt.getTime()
        )
      : form
        ? [form]
        : [];

  const adultOccupants =
    formGroup.length > 0
      ? await db
          .select({
            id: gendarmerieOccupants.id,
            nom: gendarmerieOccupants.nom,
            prenom: gendarmerieOccupants.prenom,
            nationalite: gendarmerieOccupants.nationalite,
            photoPieceUrl: gendarmerieOccupants.photoPieceUrl,
          })
          .from(gendarmerieOccupants)
          .where(
            inArray(
              gendarmerieOccupants.formId,
              formGroup.map((f) => f.id)
            )
          )
          .orderBy(gendarmerieOccupants.createdAt)
      : [];

  // Le Bulletin Individuel ne concerne légalement que les adultes (table gendarmerieOccupants) ;
  // les photos des enfants sont collectées à part, sans nom associé — on les ajoute quand même
  // ici pour que la sécurité voie bien tout le monde qui accompagne la réservation.
  const enfantsOccupants = formGroup.flatMap((f, fi) =>
    (f.enfantsPassportUrls ?? []).map((url, i) => ({
      id: `${f.id}-enfant-${fi}-${i}`,
      nom: "Enfant",
      prenom: null,
      nationalite: null,
      photoPieceUrl: url,
    }))
  );

  const occupants = [...adultOccupants, ...enfantsOccupants];

  const arrivee = form?.checkIn
    ? format(new Date(form.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateArrivee ?? "") || null;
  const depart = form?.checkOut
    ? format(new Date(form.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(form?.contratDateDepart ?? "") || null;
  const nbAdultes = form?.nbAdultes ?? form?.contratNbAdultes ?? null;
  const nbEnfants = form?.nbEnfants ?? form?.contratNbEnfants ?? 0;
  const arriveeAujourdhui = form?.checkIn ? isSameDay(new Date(form.checkIn), nowInMorocco()) : false;

  return {
    villaId: villa.id,
    villaNom: villa.nom,
    villaNumero: villa.numero,
    arrivee,
    depart,
    nbAdultes,
    nbEnfants,
    occupants,
    arriveeAujourdhui,
  };
}

export async function getVillaSecurityData(villaId: string): Promise<VillaSecurityData | null> {
  const db = getDb();
  const [villa] = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);
  if (!villa) return null;
  return buildVillaSecurityData(db, villa);
}

export async function getSecuriteDomaines(): Promise<{ id: string; nom: string }[]> {
  const db = getDb();
  const rows = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines);
  return rows
    .filter((d) => DOMAINES_SECURITE.includes(d.nom))
    .sort((a, b) => DOMAINES_SECURITE.indexOf(a.nom) - DOMAINES_SECURITE.indexOf(b.nom));
}

export async function getVillasSecurityDataForDomaine(
  domaineId: string,
  options?: { jourSeulement?: boolean }
): Promise<{ domaineNom: string; villas: VillaSecurityData[] } | null> {
  const db = getDb();
  const [domaine] = await db.select({ id: domaines.id, nom: domaines.nom }).from(domaines).where(eq(domaines.id, domaineId));
  if (!domaine) return null;

  const domaineVillas = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(and(eq(villas.domaineId, domaineId), eq(villas.type, "villa")))
    .orderBy(asc(villas.numero));

  let villaList = await Promise.all(domaineVillas.map((v) => buildVillaSecurityData(db, v)));
  if (options?.jourSeulement) {
    villaList = villaList.filter((v) => v.arriveeAujourdhui);
  }

  return { domaineNom: domaine.nom, villas: villaList };
}
