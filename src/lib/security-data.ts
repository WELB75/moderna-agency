import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
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
  const now = nowInMorocco();

  // Le séjour en cours (s'il y en a un) sert de référence pour regrouper toutes les fiches
  // qui lui appartiennent : la fiche liée à la réservation (adultes + enfants) ET les liens
  // individuels générés en plus pour chaque adulte (un Bulletin Individuel par personne).
  const [sejourActuel] = await db
    .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villa.id),
        lte(reservations.checkIn, now),
        gte(reservations.checkOut, now),
        ne(reservations.status, "annulee")
      )
    )
    .orderBy(desc(reservations.checkIn))
    .limit(1);

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
  // séjournent ensemble, l'équipe génère en plus un lien distinct par adulte
  // (generateGendarmerieForms, sans réservation associée) — le format légalement correct.
  // Quand ces liens individuels existent pour le séjour en cours, ils remplacent la fiche
  // groupée pour les adultes (sinon on compterait les mêmes personnes deux fois) ; les
  // enfants, eux, ne sont jamais collectés que sur la fiche groupée liée à la réservation.
  const formesIndividuelles = sejourActuel
    ? allForms.filter(
        (f) => !f.reservationId && f.createdAt >= sejourActuel.checkIn && f.createdAt <= sejourActuel.checkOut
      )
    : form && !form.reservationId
      ? allForms.filter((f) => !f.reservationId && f.createdAt.getTime() === form.createdAt.getTime())
      : [];

  const formesReservation = sejourActuel
    ? allForms.filter((f) => f.reservationId === sejourActuel.id)
    : form?.reservationId
      ? [form]
      : [];

  // Sécurité : si le séjour en cours (nouvelle arrivée) n'a pas encore de fiche remplie, on
  // ne doit jamais afficher "aucune personne enregistrée" tant qu'une fiche complétée existe
  // pour cette villa — on garde la dernière fiche connue affichée jusqu'à ce qu'une nouvelle
  // la remplace (le document doit toujours pouvoir être présenté en cas de contrôle).
  const derniereFicheConnue = form ? [form] : [];
  const formesAdultes =
    formesIndividuelles.length > 0 ? formesIndividuelles : formesReservation.length > 0 ? formesReservation : derniereFicheConnue;
  // Les enfants peuvent en théorie être présents sur n'importe quelle fiche du séjour.
  const formesEnfants =
    formesReservation.length > 0 || formesIndividuelles.length > 0
      ? [...formesReservation, ...formesIndividuelles]
      : derniereFicheConnue;

  const adultOccupants =
    formesAdultes.length > 0
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
              formesAdultes.map((f) => f.id)
            )
          )
          .orderBy(gendarmerieOccupants.createdAt)
      : [];

  // Le Bulletin Individuel ne concerne légalement que les adultes (table gendarmerieOccupants) ;
  // les photos des enfants sont collectées à part, sans nom associé — on les ajoute quand même
  // ici pour que la sécurité voie bien tout le monde qui accompagne la réservation.
  const enfantsVus = new Set<string>();
  const enfantsOccupants = formesEnfants.flatMap((f) =>
    (f.enfantsPassportUrls ?? [])
      .filter((url) => {
        if (enfantsVus.has(url)) return false;
        enfantsVus.add(url);
        return true;
      })
      .map((url, i) => ({
        id: `${f.id}-enfant-${i}`,
        nom: "Enfant",
        prenom: null,
        nationalite: null,
        photoPieceUrl: url,
      }))
  );

  const occupants = [...adultOccupants, ...enfantsOccupants];

  // Pour les dates/effectifs, on préfère la fiche du groupe qui a une réservation associée
  // (les liens individuels seuls n'ont ni dates ni nombre d'adultes/enfants renseignés).
  const referenceForm = formesReservation[0] ?? form;

  const arrivee = referenceForm?.checkIn
    ? format(new Date(referenceForm.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(referenceForm?.contratDateArrivee ?? "") || null;
  const depart = referenceForm?.checkOut
    ? format(new Date(referenceForm.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
    : formatDateFr(referenceForm?.contratDateDepart ?? "") || null;
  const nbAdultes = referenceForm?.nbAdultes ?? referenceForm?.contratNbAdultes ?? null;
  const nbEnfants = referenceForm?.nbEnfants ?? referenceForm?.contratNbEnfants ?? 0;
  const arriveeAujourdhui = referenceForm?.checkIn ? isSameDay(new Date(referenceForm.checkIn), nowInMorocco()) : false;

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
