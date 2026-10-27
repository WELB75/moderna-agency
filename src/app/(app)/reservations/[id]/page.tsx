import Link from "next/link";
import { reservationRecaps } from "@/db/schema-recaps";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { reservations, villas, domaines, gendarmerieForms, contratsLocation, personnel, personnelAffectations, clients } from "@/db/schema";
import { ReservationRowCard, type ReservationRow } from "@/components/app/reservation-row-card";
import { type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { montantMenageDu, montantCuisineDu, estPayeParProprietaire } from "@/lib/personnel-tarifs";
import { buildPersonnelOptions, getQualiteMoyenneById } from "@/lib/personnel-options";
import { phonesMatch } from "@/lib/phone";
import { format } from "date-fns";
import { ReservationHistorique } from "@/components/app/reservation-historique";
import { journalDeLaReservation } from "@/lib/journal";
import { normaliseCanal } from "@/lib/canal";
import { nowInMorocco } from "@/lib/now";
import { lienPlateforme } from "@/lib/lien-plateforme";
import { CautionStripeCard } from "@/components/app/caution-stripe-card";
import { cautionDeLaReservation } from "@/lib/caution/store";
import { cautionDemandable, formatEuros } from "@/lib/caution/regles";
import { chargerContexteCaution } from "@/lib/caution/service";

// Fiche complète d'une réservation, identique à sa carte du tableau de bord (ménage/cuisine
// éditables, validation check-in/out, documents...), mais accessible directement par id — pour
// que la recherche globale amène précisément ici plutôt que sur la page villa générique.
export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [r] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      canal: reservations.canal,
      beds24BookingId: reservations.beds24BookingId,
      notes: reservations.notes,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestPhone: reservations.guestPhone,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
      villaPhotoUrl: villas.photoUrl,
      villaNbChambres: villas.nbChambres,
      codeBoitier: villas.codeBoitier,
      codePorteEntree: villas.codePorteEntree,
      codeChambreMaster: villas.codeChambreMaster,
      repasInclusDansLoyer: villas.repasInclusDansLoyer,
      guideBienvenueUrl: villas.guideBienvenueUrl,
      personnelPayeParProprietaireNoms: villas.personnelPayeParProprietaireNoms,
      numeroImmeuble: villas.numeroImmeuble,
      proprietaireTelephone: villas.proprietaireTelephone,
      domaineNom: domaines.nom,
      domaineMapsUrl: domaines.mapsUrl,
      domaineWazeUrl: domaines.wazeUrl,
      domaineSecuritePhone: domaines.securitePhone,
      domaineLatitude: domaines.latitude,
      domaineLongitude: domaines.longitude,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
      checkinValideAt: reservations.checkinValideAt,
      checkinValidePar: reservations.checkinValidePar,
      checkoutValideAt: reservations.checkoutValideAt,
      checkoutValidePar: reservations.checkoutValidePar,
      brahimPrevenuAt: reservations.brahimPrevenuAt,
      aRelancer: reservations.aRelancer,
      messageArriveeEnvoyeAt: reservations.messageArriveeEnvoyeAt,
      messageBienvenueEnvoyeAt: reservations.messageBienvenueEnvoyeAt,
      messageLocalisationEnvoyeAt: reservations.messageLocalisationEnvoyeAt,
      messageSecuriteEnvoyeAt: reservations.messageSecuriteEnvoyeAt,
      messageCuisineEnvoyeAt: reservations.messageCuisineEnvoyeAt,
      rawData: reservations.rawData,
      beds24RoomId: villas.beds24RoomId,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!r) notFound();

  const [fiche] = await db
    .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.reservationId, r.id))
    .limit(1);
  const ficheStatut = fiche ? (fiche.statut === "complete" ? "complete" : "en_attente") : null;
  const ficheId = fiche?.id ?? null;

  let contratStatut: "signe" | "en_attente" | null = null;
  let contratId: string | null = null;
  if (r.villaId) {
    const contratsVilla = await db
      .select({ id: contratsLocation.id, dateArrivee: contratsLocation.dateArrivee, statut: contratsLocation.statut })
      .from(contratsLocation)
      .where(eq(contratsLocation.villaId, r.villaId));
    const dateKey = format(new Date(r.checkIn), "yyyy-MM-dd");
    const matching = contratsVilla.filter((c) => c.dateArrivee === dateKey);
    if (matching.length > 0) {
      const signe = matching.find((c) => c.statut === "signe");
      contratStatut = signe ? "signe" : "en_attente";
      contratId = (signe ?? matching[0]).id;
    }
  }

  const affectations = await db
    .select({
      id: personnelAffectations.id,
      personnelId: personnelAffectations.personnelId,
      nom: personnel.nom,
      telephone: personnel.telephone,
      role: personnel.role,
      faitAt: personnelAffectations.faitAt,
      nbJours: personnelAffectations.nbJours,
      avecDejeuner: personnelAffectations.avecDejeuner,
      payeAt: personnelAffectations.payeAt,
      moment: personnelAffectations.moment,
      commentaire: personnelAffectations.commentaire,
      qualiteNote: personnelAffectations.qualiteNote,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
    .where(eq(personnelAffectations.reservationId, r.id));

  const toAssigne = (a: (typeof affectations)[number]): PersonnelAssigne => ({
    affectationId: a.id,
    personnelId: a.personnelId,
    commentaire: a.commentaire,
    nom: a.nom,
    telephone: a.telephone,
    faitAt: a.faitAt,
    nbJours: a.nbJours,
    avecDejeuner: a.avecDejeuner,
    payeAt: a.payeAt,
    qualiteNote: a.qualiteNote,
  });
  const menageSejourAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "menage" && a.moment === "sejour").map(toAssigne);
  const menageDepartAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "menage" && a.moment === "depart").map(toAssigne);
  const cuisineAssignes: PersonnelAssigne[] = affectations.filter((a) => a.role === "cuisine").map(toAssigne);

  const activePersonnel = await db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom));
  const domaineCoords = { latitude: r.domaineLatitude, longitude: r.domaineLongitude };
  const qualiteById = await getQualiteMoyenneById(db);
  const menageOptions = buildPersonnelOptions(activePersonnel, "menage", domaineCoords, qualiteById);
  const cuisineOptions = buildPersonnelOptions(activePersonnel, "cuisine", domaineCoords, qualiteById);

  const cashAPrevoir = affectations.reduce((sum, a) => {
    if (a.payeAt || estPayeParProprietaire(r.personnelPayeParProprietaireNoms, a.nom)) return sum;
    const montant =
      a.role === "menage"
        ? montantMenageDu(a.faitAt, a.nbJours, { domaineNom: r.domaineNom, nbChambres: r.villaNbChambres })
        : montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner);
    return sum + montant;
  }, 0);

  let clientConnu: { nom: string; telephone: string | null; notes: string | null } | null = null;
  if (r.guestPhone) {
    const allClients = await db.select({ nom: clients.nom, telephone: clients.telephone, notes: clients.notes }).from(clients);
    clientConnu = allClients.find((c) => phonesMatch(c.telephone, r.guestPhone)) ?? null;
  }

  const [recapRow] = await db
    .select()
    .from(reservationRecaps)
    .where(eq(reservationRecaps.reservationId, r.id))
    .limit(1);
  const recapTotal = recapRow?.totalFinal ? Number(recapRow.totalFinal) : null;
  const recapAvance = recapRow?.avanceVersee ? Number(recapRow.avanceVersee) : null;

  // Historique "qui a fait quoi" (journal) + date d'ajout réelle dans l'app.
  const [meta] = await db
    .select({ createdAt: reservations.createdAt, beds24RoomId: villas.beds24RoomId })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, r.id))
    .limit(1);
  const journal = await journalDeLaReservation(r.id);
  // Refermer sur Beds24 : seulement ce qui a été créé dans l'app (à la main ou par l'agent IA :
  // c'est l'app qui ferme les dates à la création), pas Airbnb, et seulement pour un séjour pas encore terminé.
  const peutRefermer =
    (r.source === "manuel" || r.source === "whatsapp-ia") &&
    normaliseCanal(r.canal) !== "airbnb" &&
    Boolean(meta?.beds24RoomId) &&
    new Date(r.checkOut).getTime() > nowInMorocco().getTime();

  const row: ReservationRow = {
    ...r,
    ...{ rawData: undefined }, // jamais envoyé au navigateur : seul le lien en sort
    lienPlateforme: lienPlateforme(r),
    recap: recapRow
      ? {
          token: recapRow.token,
          devise: recapRow.devise,
          avanceVersee: recapAvance,
          reste: recapTotal != null ? Math.max(0, Math.round((recapTotal - (recapAvance ?? 0)) * 100) / 100) : null,
          modeReglement: recapRow.modeReglement,
          remarqueInterne: recapRow.remarqueInterne,
        }
      : null,
    personnelPayeParProprietaireNoms: r.personnelPayeParProprietaireNoms ?? [],
    repasInclusDansLoyer: r.repasInclusDansLoyer ?? false,
    ficheStatut,
    ficheId,
    contratStatut,
    contratId,
    menageSejourAssignes,
    menageDepartAssignes,
    cuisineAssignes,
    menageOptions,
    cuisineOptions,
    cashAPrevoir,
    clientConnu,
  };

  // Caution Stripe directe : visible pour les réservations où une caution est demandable (hors
  // Airbnb) ou déjà enregistrée. Une erreur de lecture ne doit pas casser la fiche.
  let cautionCarte: { montant: string; statut: string | null; detail: string | null } | null = null;
  if (r.beds24BookingId) {
    try {
      const existante = await cautionDeLaReservation(r.id);
      const ctx = await chargerContexteCaution(r.beds24BookingId);
      const demandable = cautionDemandable({ canal: r.canal, status: ctx?.status ?? "confirmed", depart: new Date(r.checkOut), maintenant: nowInMorocco() });
      if (existante || (ctx && demandable.ok)) {
        const centimes = existante?.montantCentimes ?? ctx?.montantCentimes ?? 0;
        cautionCarte = {
          montant: formatEuros(centimes),
          statut: existante?.statut ?? null,
          detail: existante?.dernierEchec ?? (existante?.nbEmpreintes && existante.nbEmpreintes > 1 ? `renouvelée ${existante.nbEmpreintes - 1} fois` : null),
        };
      }
    } catch (err) {
      console.error("Fiche réservation : lecture de la caution Stripe impossible", err);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0">
        <ArrowLeft className="h-4 w-4" />
        Retour à l&apos;accueil
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{row.guestName}</h1>
        <p className="text-sm text-muted-foreground">
          {row.villaNom ? `${row.villaNom} (n°${row.villaNumero})` : "Villa non renseignée"}
        </p>
      </div>

      <div className="space-y-4">
        <ReservationRowCard r={row} kind="in" />
        <ReservationRowCard r={row} kind="out" />
      </div>

      {cautionCarte && r.beds24BookingId ? (
        <CautionStripeCard
          reservationId={r.id}
          beds24BookingId={r.beds24BookingId}
          montantLibelle={cautionCarte.montant}
          statut={cautionCarte.statut}
          detail={cautionCarte.detail}
        />
      ) : null}

      <ReservationHistorique
        reservationId={r.id}
        ajouteeLe={meta?.createdAt ? new Date(meta.createdAt).toISOString() : null}
        entrees={journal}
        peutRefermer={peutRefermer}
      />
    </div>
  );
}
