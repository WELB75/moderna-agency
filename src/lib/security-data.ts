import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, domaines, reservations, contratsLocation } from "@/db/schema";
import { formatDateFr } from "@/lib/format-date";
import { nowInMorocco } from "@/lib/now";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

// Phase de test : on ne travaille que sur le Domaine Moderna II (Zaraba et Noria mis de côté).
const DOMAINES_SECURITE = ["Domaine Moderna II"];

// Tous les champs du Bulletin Individuel (voir FIELD_KEYS dans gendarmerie-i18n.ts) + signature
// et photo — nécessaires pour imprimer la fiche police officielle de chaque adulte directement
// depuis le lien sécurité, sans repasser par l'app authentifiée (Kamel, 2026-09-01).
const CHAMPS_OCCUPANT_ADULTE = {
  id: gendarmerieOccupants.id,
  nom: gendarmerieOccupants.nom,
  prenom: gendarmerieOccupants.prenom,
  dateNaissance: gendarmerieOccupants.dateNaissance,
  lieuNaissance: gendarmerieOccupants.lieuNaissance,
  nationalite: gendarmerieOccupants.nationalite,
  profession: gendarmerieOccupants.profession,
  venantDe: gendarmerieOccupants.venantDe,
  allantA: gendarmerieOccupants.allantA,
  dateArrivee: gendarmerieOccupants.dateArrivee,
  domicileHabituel: gendarmerieOccupants.domicileHabituel,
  typePiece: gendarmerieOccupants.typePiece,
  numeroPiece: gendarmerieOccupants.numeroPiece,
  datePiece: gendarmerieOccupants.datePiece,
  lieuPiece: gendarmerieOccupants.lieuPiece,
  signatureNom: gendarmerieOccupants.signatureNom,
  signatureImage: gendarmerieOccupants.signatureImage,
  photoPieceUrl: gendarmerieOccupants.photoPieceUrl,
} as const;

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
          .select(CHAMPS_OCCUPANT_ADULTE)
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
        estEnfant: true as const,
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

// Lien propre à CHAQUE réservation (pas un lien permanent par villa qui affiche "les derniers
// occupants connus") : quelqu'un qui a reçu ce lien pour un séjour ne doit jamais pouvoir
// revenir dessus plus tard et voir les occupants d'un séjour suivant à la même villa. Kamel,
// 2026-08-20 : "j'ai encore hamza ici ! les liens doivent toujours etre different... ils
// peuvent revenir sur les anciens liens et voir les locataires". Un vieux lien ne montre donc
// plus jamais que les occupants de SA PROPRE réservation, figés, même après le départ.
export async function getReservationSecurityData(reservationId: string): Promise<VillaSecurityData | null> {
  const db = getDb();
  const [reservation] = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!reservation || !reservation.villaId) return null;

  const [villa] = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero })
    .from(villas)
    .where(eq(villas.id, reservation.villaId))
    .limit(1);
  if (!villa) return null;

  const forms = await db
    .select({
      id: gendarmerieForms.id,
      reservationId: gendarmerieForms.reservationId,
      createdAt: gendarmerieForms.createdAt,
      enfantsPassportUrls: gendarmerieForms.enfantsPassportUrls,
    })
    .from(gendarmerieForms)
    .where(and(eq(gendarmerieForms.villaId, villa.id), eq(gendarmerieForms.statut, "complete")))
    .orderBy(desc(gendarmerieForms.completedAt));

  // Fiche groupée liée directement à cette réservation, ou fiches individuelles (un Bulletin
  // par adulte) créées pendant sa fenêtre de séjour — jamais celles d'une autre réservation.
  const formesReservation = forms.filter((f) => f.reservationId === reservation.id);
  const formesIndividuelles = forms.filter(
    (f) => !f.reservationId && f.createdAt >= reservation.checkIn && f.createdAt <= reservation.checkOut
  );
  const formesAdultes = formesIndividuelles.length > 0 ? formesIndividuelles : formesReservation;
  const formesEnfants = [...formesReservation, ...formesIndividuelles];

  const adultOccupants =
    formesAdultes.length > 0
      ? await db
          .select(CHAMPS_OCCUPANT_ADULTE)
          .from(gendarmerieOccupants)
          .where(
            inArray(
              gendarmerieOccupants.formId,
              formesAdultes.map((f) => f.id)
            )
          )
          .orderBy(gendarmerieOccupants.createdAt)
      : [];

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
        estEnfant: true as const,
      }))
  );

  return {
    villaId: villa.id,
    villaNom: villa.nom,
    villaNumero: villa.numero,
    arrivee: format(new Date(reservation.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }),
    depart: format(new Date(reservation.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }),
    nbAdultes: reservation.nbAdultes,
    nbEnfants: reservation.nbEnfants ?? 0,
    occupants: [...adultOccupants, ...enfantsOccupants],
    arriveeAujourdhui: isSameDay(new Date(reservation.checkIn), nowInMorocco()),
  };
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
