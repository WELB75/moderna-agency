import { and, asc, count, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants, villas, domaines, reservations, contratsLocation } from "@/db/schema";
import { formatDateFr } from "@/lib/format-date";
import { nowInMorocco } from "@/lib/now";
import { logementEstIntegre } from "@/lib/domaines-actifs";
import { numeroAffichable } from "@/lib/logement-format";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

// Domaines couverts par la Sécurité, dans cet ordre — mêmes domaines que l'accueil depuis la
// nouvelle version (Beds24) : Moderna II, Zaraba (Villa Azur) et Noria (appartements Cosy).
// Chaque domaine garde ses propres agents de sécurité et donc son propre lien, jamais mélangés.
// Auparavant limité au seul Domaine Moderna II (phase de test).
export const DOMAINES_SECURITE = ["Domaine Moderna II", "Domaine Zaraba", "Noria"];

type LogementSecurite = { id: string; nom: string; numero: string; type: "villa" | "appartement" };

// Logements suivis par la Sécurité pour un domaine : exactement ceux de Hébergements (villas des
// domaines actifs + appartements reliés à Beds24), jamais les logements retirés (Villa Kamel,
// Villa Eline, Villa Elysée...). Villas d'abord, puis appartements, par numéro.
async function getLogementsSecuriteDuDomaine(
  db: ReturnType<typeof getDb>,
  domaine: { id: string; nom: string }
): Promise<LogementSecurite[]> {
  const rows = await db
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, type: villas.type, beds24RoomId: villas.beds24RoomId })
    .from(villas)
    .where(eq(villas.domaineId, domaine.id));
  const num = (v: { numero: string }) => {
    const n = parseInt(numeroAffichable(v.numero) ?? "", 10);
    return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
  };
  return rows
    .filter((v) => logementEstIntegre({ ...v, domaineNom: domaine.nom }))
    .sort(
      (a, b) =>
        Number(a.type === "appartement") - Number(b.type === "appartement") ||
        num(a) - num(b) ||
        a.nom.localeCompare(b.nom, "fr")
    )
    .map(({ id, nom, numero, type }) => ({ id, nom, numero, type }));
}

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
  villa: { id: string; nom: string; numero: string; type?: "villa" | "appartement" }
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
    villaType: villa.type,
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
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, type: villas.type })
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
    .select({ id: villas.id, nom: villas.nom, numero: villas.numero, type: villas.type })
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
    villaType: villa.type,
    arrivee: format(new Date(reservation.checkIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }),
    depart: format(new Date(reservation.checkOut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr }),
    nbAdultes: reservation.nbAdultes,
    nbEnfants: reservation.nbEnfants ?? 0,
    occupants: [...adultOccupants, ...enfantsOccupants],
    arriveeAujourdhui: isSameDay(new Date(reservation.checkIn), nowInMorocco()),
  };
}

export async function getSecuriteDomaines(): Promise<{ id: string; nom: string; securitePhone: string | null }[]> {
  const db = getDb();
  const rows = await db
    .select({ id: domaines.id, nom: domaines.nom, securitePhone: domaines.securitePhone })
    .from(domaines);
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

  // Villas ET appartements intégrés (Noria n'a que des appartements), sans les logements retirés.
  const logements = await getLogementsSecuriteDuDomaine(db, domaine);

  let villaList = await Promise.all(logements.map((v) => buildVillaSecurityData(db, v)));
  if (options?.jourSeulement) {
    villaList = villaList.filter((v) => v.arriveeAujourdhui);
  }

  return { domaineNom: domaine.nom, villas: villaList };
}

// ---------------------------------------------------------------------------------------------
// Vue d'ensemble de la page Sécurité (app connectée) : un résumé léger par logement — statut du
// jour, voyageur concerné, état de la fiche police — sans charger les photos des pièces
// d'identité (chargées seulement quand on déplie un logement, voir actions/securite.ts).
// ---------------------------------------------------------------------------------------------

export type SecuriteStatut = "arrivee" | "depart" | "occupe" | "bloque" | "libre";
export type SecuriteFicheStatut = "complete" | "en_attente" | "absente" | "non_requise";

export type SecuriteLogementResume = {
  villaId: string;
  nom: string;
  numero: string | null;
  type: "villa" | "appartement";
  statut: SecuriteStatut;
  // Séjour concerné aujourd'hui : l'arrivée du jour en priorité, sinon le séjour en cours.
  sejour: {
    reservationId: string;
    guestName: string;
    canal: string | null;
    arrivee: string;
    depart: string;
    arriveeAujourdhui: boolean;
    departAujourdhui: boolean;
    nbAdultes: number | null;
    nbEnfants: number;
    personnesAttendues: number | null;
    personnesEnregistrees: number;
    fiche: SecuriteFicheStatut;
  } | null;
  prochaineArrivee: { guestName: string; date: string } | null;
};

export type SecuriteDomaineResume = {
  id: string;
  nom: string;
  securitePhone: string | null;
  logements: SecuriteLogementResume[];
};

const formatJourHeure = (d: Date) => format(d, "EEE d MMM '·' HH:mm", { locale: fr });

// Blocages créés depuis l'assistant (propriétaire, travaux, autre) : personne à contrôler, pas de
// fiche police. Les séjours "Famille" font entrer du monde mais sans fiche police demandée.
const estBlocage = (canal: string | null) => (canal ?? "").startsWith("Blocage");
const ficheRequise = (canal: string | null) => !estBlocage(canal) && canal !== "Famille";

export async function getSecuriteOverview(): Promise<SecuriteDomaineResume[]> {
  const db = getDb();
  const now = nowInMorocco();
  const domainesSecurite = await getSecuriteDomaines();
  const logementsParDomaine = await Promise.all(
    domainesSecurite.map(async (d) => ({ domaine: d, logements: await getLogementsSecuriteDuDomaine(db, d) }))
  );
  const villaIds = logementsParDomaine.flatMap((d) => d.logements.map((l) => l.id));
  if (villaIds.length === 0) {
    return domainesSecurite.map((d) => ({ ...d, logements: [] }));
  }

  // Séjours pas encore terminés (en cours, du jour, à venir sur 60 jours).
  const resas = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      canal: reservations.canal,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.villaId, villaIds),
        ne(reservations.status, "annulee"),
        gte(reservations.checkOut, startOfDay(now)),
        lte(reservations.checkIn, addDays(now, 60))
      )
    )
    .orderBy(asc(reservations.checkIn));

  // Fiches police récentes de ces logements (sans les photos) : fiche groupée liée à la
  // réservation, ou Bulletins Individuels créés pendant le séjour — même règle que
  // getReservationSecurityData ci-dessus.
  const fiches = await db
    .select({
      id: gendarmerieForms.id,
      reservationId: gendarmerieForms.reservationId,
      villaId: gendarmerieForms.villaId,
      statut: gendarmerieForms.statut,
      createdAt: gendarmerieForms.createdAt,
      // jsonb_typeof : une valeur JSON null (et non SQL NULL) ferait échouer jsonb_array_length.
      nbPhotosEnfants: sql<number>`case when jsonb_typeof(${gendarmerieForms.enfantsPassportUrls}) = 'array' then jsonb_array_length(${gendarmerieForms.enfantsPassportUrls}) else 0 end`,
    })
    .from(gendarmerieForms)
    .where(and(inArray(gendarmerieForms.villaId, villaIds), gte(gendarmerieForms.createdAt, addDays(now, -120))));

  const ficheIdsCompletes = fiches.filter((f) => f.statut === "complete").map((f) => f.id);
  const adultesParFiche = new Map<string, number>();
  if (ficheIdsCompletes.length > 0) {
    const comptes = await db
      .select({ formId: gendarmerieOccupants.formId, n: count() })
      .from(gendarmerieOccupants)
      .where(inArray(gendarmerieOccupants.formId, ficheIdsCompletes))
      .groupBy(gendarmerieOccupants.formId);
    for (const c of comptes) adultesParFiche.set(c.formId, Number(c.n));
  }

  const resumeSejour = (r: (typeof resas)[number]): NonNullable<SecuriteLogementResume["sejour"]> => {
    const fichesResa = fiches.filter((f) => f.reservationId === r.id);
    const fichesIndiv = fiches.filter(
      (f) => !f.reservationId && f.villaId === r.villaId && f.createdAt >= r.checkIn && f.createdAt <= r.checkOut
    );
    const completesResa = fichesResa.filter((f) => f.statut === "complete");
    const completesIndiv = fichesIndiv.filter((f) => f.statut === "complete");
    const fichesAdultes = completesIndiv.length > 0 ? completesIndiv : completesResa;
    const adultes = fichesAdultes.reduce((s, f) => s + (adultesParFiche.get(f.id) ?? 0), 0);
    const enfants = [...completesResa, ...completesIndiv].reduce((s, f) => s + Number(f.nbPhotosEnfants ?? 0), 0);
    const nbEnfants = r.nbEnfants ?? 0;
    const fiche: SecuriteFicheStatut = !ficheRequise(r.canal)
      ? "non_requise"
      : completesResa.length + completesIndiv.length > 0
        ? "complete"
        : fichesResa.length + fichesIndiv.length > 0
          ? "en_attente"
          : "absente";
    return {
      reservationId: r.id,
      guestName: r.guestName,
      canal: r.canal,
      arrivee: formatJourHeure(new Date(r.checkIn)),
      depart: formatJourHeure(new Date(r.checkOut)),
      arriveeAujourdhui: isSameDay(new Date(r.checkIn), now),
      departAujourdhui: isSameDay(new Date(r.checkOut), now),
      nbAdultes: r.nbAdultes,
      nbEnfants,
      personnesAttendues: r.nbAdultes !== null ? r.nbAdultes + nbEnfants : null,
      personnesEnregistrees: adultes + enfants,
      fiche,
    };
  };

  return logementsParDomaine.map(({ domaine, logements }) => ({
    ...domaine,
    logements: logements.map((l): SecuriteLogementResume => {
      const sesResas = resas.filter((r) => r.villaId === l.id);
      const arriveeDuJour = sesResas.find((r) => isSameDay(new Date(r.checkIn), now));
      const enCours = [...sesResas].reverse().find((r) => r.checkIn <= now && r.checkOut > now);
      const reference = arriveeDuJour ?? enCours ?? null;
      const prochaine = sesResas.find((r) => r.checkIn > now && r.id !== reference?.id && !estBlocage(r.canal));

      let statut: SecuriteStatut = "libre";
      if (reference) {
        if (estBlocage(reference.canal)) statut = "bloque";
        else if (arriveeDuJour) statut = "arrivee";
        else if (isSameDay(new Date(reference.checkOut), now)) statut = "depart";
        else statut = "occupe";
      }

      return {
        villaId: l.id,
        nom: l.nom,
        numero: numeroAffichable(l.numero),
        type: l.type,
        statut,
        sejour: reference ? resumeSejour(reference) : null,
        prochaineArrivee: prochaine
          ? { guestName: prochaine.guestName, date: format(new Date(prochaine.checkIn), "EEE d MMM", { locale: fr }) }
          : null,
      };
    }),
  }));
}
