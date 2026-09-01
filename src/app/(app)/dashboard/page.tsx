import Link from "next/link";
import { and, gte, lte, lt, or, eq, ne, asc, desc, isNotNull, isNull, inArray } from "drizzle-orm";
import {
  format,
  isSameDay,
  isPast,
  isToday,
  isTomorrow,
  startOfDay,
  startOfMonth,
  subMonths,
  endOfDay,
  addDays,
  differenceInCalendarDays,
} from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import {
  reservations,
  villas,
  domaines,
  maintenanceRecords,
  superhoteSyncLog,
  gendarmerieForms,
  contratsLocation,
  personnel,
  personnelAffectations,
  clients,
  interventions,
  staffAssignmentRequests,
  cashEntries,
} from "@/db/schema";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { SyncBeds24Button } from "@/components/app/sync-beds24-button";
import { ImportSuperhoteCsvDialog } from "@/components/app/import-superhote-csv-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";
import { DomainePlanTrigger } from "@/components/app/domaine-plan-trigger";
import { MenuGrid } from "@/components/app/menu-grid";
import { GlobalSearchOverlay } from "@/components/app/global-search-overlay";
import { ReservationRowCard, type ReservationRow } from "@/components/app/reservation-row-card";
import { type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import {
  LogIn,
  LogOut,
  Wrench,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  DoorOpen,
  DoorClosed,
  BrushCleaning,
  ChefHat,
  Wallet,
  AlertTriangle,
  Hourglass,
  FileWarning,
  type LucideIcon,
} from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { getUnreadChatCount } from "@/lib/actions/chat";
import {
  montantMenageDu,
  montantCuisineDu,
  estPayeParProprietaire,
  TARIF_MENAGE,
  TARIF_CUISINE_PETIT_DEJEUNER,
  TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER,
} from "@/lib/personnel-tarifs";
import { cn } from "@/lib/utils";
import { phonesMatch } from "@/lib/phone";

const DAYS_AHEAD = 7;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string }>;
}) {
  const { semaine } = await searchParams;
  // Décalage en nombre de semaines de 7 jours par rapport à aujourd'hui : permet de naviguer
  // vers les semaines passées (ou futures) avec des flèches, sans jamais toucher au "maintenant"
  // réel utilisé pour l'occupation en cours ou les stats "aujourd'hui".
  const offsetSemaines = Number.isFinite(Number(semaine)) ? Math.trunc(Number(semaine)) : 0;
  const db = getDb();
  const now = nowInMorocco();
  const unreadChatCount = await getUnreadChatCount();
  const viewAnchor = addDays(now, offsetSemaines * DAYS_AHEAD);
  const rangeStart = startOfDay(viewAnchor);
  const rangeEnd = endOfDay(addDays(viewAnchor, DAYS_AHEAD - 1));

  const upcoming = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      canal: reservations.canal,
      notes: reservations.notes,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestPhone: reservations.guestPhone,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
      villaPhotoUrl: villas.photoUrl,
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
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
      checkinValideAt: reservations.checkinValideAt,
      checkinValidePar: reservations.checkinValidePar,
      checkoutValideAt: reservations.checkoutValideAt,
      checkoutValidePar: reservations.checkoutValidePar,
      aRelancer: reservations.aRelancer,
      messageArriveeEnvoyeAt: reservations.messageArriveeEnvoyeAt,
      messageBienvenueEnvoyeAt: reservations.messageBienvenueEnvoyeAt,
      messageLocalisationEnvoyeAt: reservations.messageLocalisationEnvoyeAt,
      messageSecuriteEnvoyeAt: reservations.messageSecuriteEnvoyeAt,
      messageCuisineEnvoyeAt: reservations.messageCuisineEnvoyeAt,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      and(
        ne(reservations.status, "annulee"),
        or(
          and(gte(reservations.checkIn, rangeStart), lte(reservations.checkIn, rangeEnd)),
          and(gte(reservations.checkOut, rangeStart), lte(reservations.checkOut, rangeEnd))
        )
      )
    )
    .orderBy(asc(reservations.checkIn));

  // Fiche police / contrat : indicateurs affichés sur chaque carte de réservation. La fiche
  // police est liée directement à la réservation (reservationId) ; le contrat n'a pas ce lien
  // en base, on le rapproche par villa + date d'arrivée identique.
  const reservationIds = upcoming.map((r) => r.id);
  const relatedFiches =
    reservationIds.length > 0
      ? await db
          .select({ id: gendarmerieForms.id, reservationId: gendarmerieForms.reservationId, statut: gendarmerieForms.statut })
          .from(gendarmerieForms)
          .where(inArray(gendarmerieForms.reservationId, reservationIds))
      : [];
  const ficheStatutByReservation = new Map<string, "complete" | "en_attente">();
  const ficheIdByReservation = new Map<string, string>();
  for (const f of relatedFiches) {
    if (!f.reservationId) continue;
    const current = ficheStatutByReservation.get(f.reservationId);
    if (f.statut === "complete" || current !== "complete") {
      ficheStatutByReservation.set(f.reservationId, f.statut === "complete" ? "complete" : "en_attente");
      ficheIdByReservation.set(f.reservationId, f.id);
    }
  }

  const villaIdsForContrats = Array.from(new Set(upcoming.map((r) => r.villaId).filter((id): id is string => Boolean(id))));
  const relatedContrats =
    villaIdsForContrats.length > 0
      ? await db
          .select({
            id: contratsLocation.id,
            villaId: contratsLocation.villaId,
            dateArrivee: contratsLocation.dateArrivee,
            statut: contratsLocation.statut,
          })
          .from(contratsLocation)
          .where(inArray(contratsLocation.villaId, villaIdsForContrats))
      : [];
  const contratByVillaAndDate = new Map<string, { id: string; statut: "signe" | "en_attente" }>();
  for (const c of relatedContrats) {
    if (!c.villaId || !c.dateArrivee) continue;
    const key = `${c.villaId}|${c.dateArrivee}`;
    const current = contratByVillaAndDate.get(key);
    if (c.statut === "signe" || current?.statut !== "signe") {
      contratByVillaAndDate.set(key, { id: c.id, statut: c.statut === "signe" ? "signe" : "en_attente" });
    }
  }

  // Ménage/cuisine : qui est affecté à ce séjour, pour le voir directement sur la carte et
  // pouvoir confirmer le ménage fait (ou en ajouter/retirer) sans devoir aller sur la page
  // Personnel.
  const relatedAffectations =
    reservationIds.length > 0
      ? await db
          .select({
            id: personnelAffectations.id,
            reservationId: personnelAffectations.reservationId,
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
          .where(inArray(personnelAffectations.reservationId, reservationIds))
      : [];
  // Ménage "sejour" (pendant le séjour, à la demande du client) et "depart" (fin de séjour, pour
  // préparer l'arrivée suivante) sont deux équipes potentiellement différentes — voir
  // personnelAffectationMomentEnum dans schema.ts.
  const menageSejourAssignesByReservation = new Map<string, PersonnelAssigne[]>();
  const menageDepartAssignesByReservation = new Map<string, PersonnelAssigne[]>();
  const cuisineAssignesByReservation = new Map<string, PersonnelAssigne[]>();
  const affectationsByReservationForCash = new Map<string, typeof relatedAffectations>();
  for (const a of relatedAffectations) {
    const map =
      a.role === "menage" ? (a.moment === "sejour" ? menageSejourAssignesByReservation : menageDepartAssignesByReservation) : cuisineAssignesByReservation;
    const list = map.get(a.reservationId) ?? [];
    list.push({
      affectationId: a.id,
      personnelId: a.personnelId,
      nom: a.nom,
      telephone: a.telephone,
      faitAt: a.faitAt,
      nbJours: a.nbJours,
      avecDejeuner: a.avecDejeuner,
      payeAt: a.payeAt,
      commentaire: a.commentaire,
      qualiteNote: a.qualiteNote,
    });
    map.set(a.reservationId, list);
    const all = affectationsByReservationForCash.get(a.reservationId) ?? [];
    all.push(a);
    affectationsByReservationForCash.set(a.reservationId, all);
  }

  const activePersonnel = await db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom));
  const menageOptions = activePersonnel.filter((p) => p.role === "menage").map((p) => ({ id: p.id, nom: p.nom }));
  const cuisineOptions = activePersonnel.filter((p) => p.role === "cuisine").map((p) => ({ id: p.id, nom: p.nom }));

  // Client connu : rapproché par téléphone (pas par nom, trop instable) — pour retrouver ses
  // habitudes s'il revient sans avoir à ouvrir la page Clients.
  const allClients = await db.select({ nom: clients.nom, telephone: clients.telephone, notes: clients.notes }).from(clients);
  function findClient(guestPhone: string | null) {
    if (!guestPhone) return null;
    return allClients.find((c) => phonesMatch(c.telephone, guestPhone)) ?? null;
  }

  const upcomingWithDocs = upcoming.map((r) => {
    const ficheStatut = ficheStatutByReservation.get(r.id) ?? null;
    const ficheId = ficheIdByReservation.get(r.id) ?? null;
    const dateKey = r.villaId ? `${r.villaId}|${format(new Date(r.checkIn), "yyyy-MM-dd")}` : null;
    const contrat = dateKey ? (contratByVillaAndDate.get(dateKey) ?? null) : null;
    const contratStatut = contrat?.statut ?? null;
    const contratId = contrat?.id ?? null;
    const menageSejourAssignes = menageSejourAssignesByReservation.get(r.id) ?? [];
    const menageDepartAssignes = menageDepartAssignesByReservation.get(r.id) ?? [];
    const cuisineAssignes = cuisineAssignesByReservation.get(r.id) ?? [];
    // Cash à prévoir pour ce séjour : ménage (200 MAD une fois confirmé fait) + cuisine
    // (100 ou 200 MAD/jour selon petit-déjeuner seul ou avec déjeuner, due au check-out), pas
    // encore payés — pour savoir combien apporter en liquide avant de partir sur place. Jamais
    // pour les villas dont le propriétaire paie directement le personnel.
    const cashAPrevoir = (affectationsByReservationForCash.get(r.id) ?? []).reduce((sum, a) => {
      if (a.payeAt || estPayeParProprietaire(r.personnelPayeParProprietaireNoms, a.nom)) return sum;
      const montant =
        a.role === "menage"
          ? montantMenageDu(a.faitAt, a.nbJours)
          : montantCuisineDu(a.nbJours, new Date(r.checkIn), new Date(r.checkOut), r.checkoutValideAt, a.avecDejeuner);
      return sum + montant;
    }, 0);
    const clientConnu = findClient(r.guestPhone);
    return {
      ...r,
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
  });

  // Phase de test : on ne travaille que sur le Domaine Moderna II (Zaraba et Noria mis de côté).
  const modernaIIUpcoming = upcomingWithDocs.filter((r) => r.domaineNom === "Domaine Moderna II");

  const upcomingMaintenance = await db
    .select({
      id: maintenanceRecords.id,
      equipement: maintenanceRecords.equipement,
      prochaineDatePrevue: maintenanceRecords.prochaineDatePrevue,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
      domaineNom: domaines.nom,
    })
    .from(maintenanceRecords)
    .leftJoin(villas, eq(maintenanceRecords.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      and(isNotNull(maintenanceRecords.prochaineDatePrevue), lte(maintenanceRecords.prochaineDatePrevue, endOfDay(addDays(now, 30))))
    )
    .orderBy(asc(maintenanceRecords.prochaineDatePrevue));

  const allVillas = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      type: villas.type,
      domaineNom: domaines.nom,
    })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .orderBy(asc(villas.nom));
  const allVillasGerees = allVillas.filter((v) => villaEstGeree(v.nom));

  // Occupation réelle = check-in validé sur place mais check-out pas encore validé (pas juste
  // la période de la réservation) : reflète qui a vraiment les clés en ce moment, pas le calendrier.
  const activeNow = await db
    .select({
      villaId: reservations.villaId,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(reservations)
    .where(
      and(
        ne(reservations.status, "annulee"),
        isNotNull(reservations.checkinValideAt),
        isNull(reservations.checkoutValideAt)
      )
    );
  const occupiedVillaIds = new Set(activeNow.map((r) => r.villaId));
  const occupantByVillaId = new Map(activeNow.filter((r) => r.villaId).map((r) => [r.villaId as string, r]));
  const villasLibres = allVillasGerees.filter((v) => !occupiedVillaIds.has(v.id));
  const villasLibresKamel = villasLibres.filter((v) => v.domaineNom === "Domaine Moderna II");

  // Plan du domaine confirmé par Kamel : le champ "numero" correspond à la position 1-17 sur le terrain.
  const modernaIIPlanVillas: PlanVilla[] = allVillasGerees
    .filter((v) => v.domaineNom === "Domaine Moderna II")
    .map((v) => {
      const occupant = occupantByVillaId.get(v.id);
      return {
        id: v.id,
        nom: v.nom,
        position: parseInt(v.numero, 10),
        libre: !occupiedVillaIds.has(v.id),
        guestName: occupant?.guestName ?? null,
        checkIn: occupant?.checkIn ?? null,
        checkOut: occupant?.checkOut ?? null,
      };
    })
    .filter((v) => !Number.isNaN(v.position));

  const modernaIIMaintenance = upcomingMaintenance.filter((m) => m.domaineNom === "Domaine Moderna II");

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(viewAnchor, i));

  const [lastSync] = await db
    .select({ finishedAt: superhoteSyncLog.finishedAt, success: superhoteSyncLog.success })
    .from(superhoteSyncLog)
    .orderBy(desc(superhoteSyncLog.startedAt))
    .limit(1);

  // --- Chiffres du jour (tête de page) -------------------------------------------------------

  const villasOccupeesKamel = allVillasGerees.filter((v) => v.domaineNom === "Domaine Moderna II" && occupiedVillaIds.has(v.id));

  // Ménage/cuisine "occupée aujourd'hui" : même logique de fenêtre de travail que le dispatch
  // automatique (voir dayAfter/moment dans whatsapp-agent/staff.ts) — ménage "depart"/"unique" ne
  // travaille que le jour du check-out, ménage "sejour" et cuisine travaillent du lendemain du
  // check-in jusqu'au check-out inclus.
  const affectationsAujourdhui = await db
    .select({
      personnelId: personnelAffectations.personnelId,
      role: personnel.role,
      moment: personnelAffectations.moment,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(personnelAffectations)
    .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
    .innerJoin(reservations, eq(personnelAffectations.reservationId, reservations.id))
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      and(
        ne(reservations.status, "annulee"),
        eq(domaines.nom, "Domaine Moderna II"),
        lte(reservations.checkIn, endOfDay(now)),
        gte(reservations.checkOut, startOfDay(now))
      )
    );
  const todayStart = startOfDay(now);
  function travailleAujourdhui(row: { role: string; moment: string | null; checkIn: Date; checkOut: Date }): boolean {
    const checkIn = new Date(row.checkIn);
    const checkOut = new Date(row.checkOut);
    if (row.role === "menage" && row.moment !== "sejour") return isSameDay(checkOut, now);
    const debutTravail = startOfDay(addDays(checkIn, 1));
    return todayStart >= debutTravail && todayStart <= startOfDay(checkOut);
  }
  const menageOccupeIds = new Set(
    affectationsAujourdhui.filter((r) => r.role === "menage" && travailleAujourdhui(r)).map((r) => r.personnelId)
  );
  const cuisineOccupeIds = new Set(
    affectationsAujourdhui.filter((r) => r.role === "cuisine" && travailleAujourdhui(r)).map((r) => r.personnelId)
  );
  const menageActif = activePersonnel.filter((p) => p.role === "menage");
  const cuisineActif = activePersonnel.filter((p) => p.role === "cuisine");
  const menageOccupeCount = menageActif.filter((p) => menageOccupeIds.has(p.id)).length;
  const cuisineOccupeCount = cuisineActif.filter((p) => cuisineOccupeIds.has(p.id)).length;

  const interventionsUrgentesEnCours = await db
    .select({ id: interventions.id })
    .from(interventions)
    .where(and(inArray(interventions.urgence, ["haute", "critique"]), ne(interventions.etape, "termine")));

  const sollicitationsEnAttente = await db
    .select({ id: staffAssignmentRequests.id })
    .from(staffAssignmentRequests)
    .innerJoin(reservations, eq(staffAssignmentRequests.reservationId, reservations.id))
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(and(eq(staffAssignmentRequests.statut, "en_recherche"), eq(domaines.nom, "Domaine Moderna II")));

  const checkInsAujourdhui = modernaIIUpcoming.filter((r) => isSameDay(new Date(r.checkIn), now));
  const checkOutsAujourdhui = modernaIIUpcoming.filter((r) => isSameDay(new Date(r.checkOut), now));
  const fichesPoliceManquantes = checkInsAujourdhui.filter((r) => r.ficheStatut !== "complete");

  // Argent physiquement disponible en caisse société (espèces) sur la période comptable en cours
  // (même découpage du 11 au 10 que la page Caisse, voir JOUR_DEBUT_PERIODE_CAISSE) — pas tout
  // l'historique, juste ce qui reste dispo pour la période active.
  const JOUR_DEBUT_PERIODE_CAISSE = 11;
  const ancrePeriodeCaisse = startOfMonth(now.getDate() >= JOUR_DEBUT_PERIODE_CAISSE ? now : subMonths(now, 1));
  const debutPeriodeCaisse = new Date(ancrePeriodeCaisse.getFullYear(), ancrePeriodeCaisse.getMonth(), JOUR_DEBUT_PERIODE_CAISSE);
  const finPeriodeCaisseExclusive = new Date(
    ancrePeriodeCaisse.getFullYear(),
    ancrePeriodeCaisse.getMonth() + 1,
    JOUR_DEBUT_PERIODE_CAISSE
  );
  const especesSocieteCaisse = (
    await db
      .select({
        type: cashEntries.type,
        caisse: cashEntries.caisse,
        financePar: cashEntries.financePar,
        moyenPaiement: cashEntries.moyenPaiement,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        domaineNom: domaines.nom,
      })
      .from(cashEntries)
      .leftJoin(villas, eq(cashEntries.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(and(gte(cashEntries.createdAt, debutPeriodeCaisse), lt(cashEntries.createdAt, finPeriodeCaisseExclusive)))
  ).filter((e) => domaineEstActif(e.domaineNom) && e.caisse === "societe" && e.moyenPaiement === "especes");
  const devisesCaisse = Array.from(new Set(especesSocieteCaisse.map((e) => e.devise)));
  const soldesCaisse = devisesCaisse.map((devise) => {
    const enDevise = especesSocieteCaisse.filter((e) => e.devise === devise);
    const totalRemise = enDevise.filter((e) => e.type === "remise").reduce((s, e) => s + Number(e.montant), 0);
    const totalDepenseSociete = enDevise
      .filter((e) => e.type === "depense" && e.financePar === "societe")
      .reduce((s, e) => s + Number(e.montant), 0);
    const totalRestitution = enDevise.filter((e) => e.type === "restitution").reduce((s, e) => s + Number(e.montant), 0);
    return { devise, solde: totalRemise - totalDepenseSociete - totalRestitution };
  });

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-card p-0.5">
              <Link
                href={offsetSemaines - 1 === 0 ? "/dashboard" : `/dashboard?semaine=${offsetSemaines - 1}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Semaine précédente"
                title="Semaine précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <h1 className="px-1.5 text-base font-semibold tracking-tight sm:text-lg">
                {offsetSemaines === 0 ? "Cette semaine" : `Du ${format(rangeStart, "d MMM", { locale: fr })} au ${format(rangeEnd, "d MMM yyyy", { locale: fr })}`}
              </h1>
              <Link
                href={offsetSemaines + 1 === 0 ? "/dashboard" : `/dashboard?semaine=${offsetSemaines + 1}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Semaine suivante"
                title="Semaine suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {offsetSemaines !== 0 ? (
              <Link href="/dashboard" className="text-sm text-primary underline-offset-4 hover:underline">
                Aujourd&apos;hui
              </Link>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{format(now, "EEEE d MMMM yyyy", { locale: fr })}</p>
        </div>

        {/* Actions de synchro/import : rarement utilisées au quotidien, donc repliées derrière
            un déclencheur discret plutôt que deux boutons pleine largeur en haut de l'accueil. */}
        <div className="flex items-center gap-2 self-start">
          <GlobalSearchOverlay />
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center justify-center border border-border p-2 text-muted-foreground marker:content-none hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-full z-20 mt-1 w-72 space-y-2 border border-border bg-popover p-3 shadow-lg">
              <p className="text-xs font-medium text-muted-foreground">Options</p>
              <div className="flex flex-col gap-1.5">
                <SyncIcalButton className="w-full" />
                <SyncBeds24Button className="w-full" />
                <ImportSuperhoteCsvDialog />
              </div>
              {lastSync?.finishedAt ? (
                <p className="text-xs text-muted-foreground">
                  Dernière synchro {lastSync.success === false ? "(échec)" : ""} : {format(lastSync.finishedAt, "d MMM HH:mm", { locale: fr })}
                </p>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      {/* Redondant sur desktop (le menu latéral donne déjà accès à tout, en toutes lettres) —
          utile seulement là où ce menu est masqué, donc tablette/smartphone. */}
      <div className="md:hidden">
        <MenuGrid unreadChatCount={unreadChatCount} />
      </div>

      <MetricsHeader
        checkInsAujourdhui={checkInsAujourdhui.length}
        checkOutsAujourdhui={checkOutsAujourdhui.length}
        villasOccupees={villasOccupeesKamel.length}
        villasLibres={villasLibresKamel.length}
        menageLibre={menageActif.length - menageOccupeCount}
        menageOccupe={menageOccupeCount}
        cuisineLibre={cuisineActif.length - cuisineOccupeCount}
        cuisineOccupe={cuisineOccupeCount}
        soldesCaisse={soldesCaisse}
        interventionsUrgentes={interventionsUrgentesEnCours.length}
        sollicitationsEnAttente={sollicitationsEnAttente.length}
        fichesPoliceManquantes={fichesPoliceManquantes.length}
      />
      <VillasLibresCard villas={villasLibresKamel} planVillas={modernaIIPlanVillas} />
      <PersonPanel reservations={modernaIIUpcoming} maintenance={modernaIIMaintenance} days={days} now={now} />
    </div>
  );
}

// Chiffres du jour, recalculés à chaque chargement — regroupe tout ce qui était auparavant
// dispersé (check-in/check-out) avec les indicateurs opérationnels qui n'avaient encore aucune
// vue d'ensemble (personnel dispo, caisse, interventions urgentes, sollicitations en attente,
// fiches police manquantes). Kamel, 2026-08-21.
function StatTile({
  icon: Icon,
  value,
  label,
  color,
  href,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color: "emerald" | "amber" | "sky" | "red" | "slate";
  href?: string;
}) {
  // Bulle d'icône façon "verre" : dégradé doux + liseré translucide de la même teinte plutôt
  // qu'un simple aplat à 10 % d'opacité — donne un vrai effet de profondeur/relief au lieu d'une
  // pastille plate. Kamel a demandé un rendu "Apple glass", 2026-08-21.
  const iconBubbleClasses: Record<typeof color, string> = {
    emerald: "bg-gradient-to-br from-emerald-400/30 to-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400",
    amber: "bg-gradient-to-br from-amber-400/30 to-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400",
    sky: "bg-gradient-to-br from-sky-400/30 to-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400",
    red: "bg-gradient-to-br from-red-400/30 to-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:text-red-400",
    slate: "bg-gradient-to-br from-slate-400/25 to-slate-500/10 text-slate-600 ring-1 ring-slate-500/15 dark:text-slate-400",
  };
  const content = (
    <div
      className={cn(
        "h-full rounded-2xl border border-white/60 bg-white/55 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_-16px_rgba(15,23,42,0.25)] backdrop-blur-xl transition-all",
        "dark:border-white/10 dark:bg-white/5 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_10px_30px_-16px_rgba(0,0,0,0.6)]",
        href && "hover:-translate-y-0.5 hover:border-white/80 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_16px_36px_-16px_rgba(15,23,42,0.3)] dark:hover:border-white/20"
      )}
    >
      {/* Empilé (icône puis texte) en mobile pour laisser toute la largeur de la colonne au
          chiffre — l'agencement icône+texte côte à côte faisait chevaucher les valeurs longues
          ("13 500 MAD") dans les colonnes étroites à 2 par ligne. Repasse à côte à côte dès `sm`,
          où les colonnes sont plus larges. Kamel, 2026-08-24. */}
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10", iconBubbleClasses[color])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl sm:leading-none">
            {value}
          </p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

function MetricsHeader({
  checkInsAujourdhui,
  checkOutsAujourdhui,
  villasOccupees,
  villasLibres,
  menageLibre,
  menageOccupe,
  cuisineLibre,
  cuisineOccupe,
  soldesCaisse,
  interventionsUrgentes,
  sollicitationsEnAttente,
  fichesPoliceManquantes,
}: {
  checkInsAujourdhui: number;
  checkOutsAujourdhui: number;
  villasOccupees: number;
  villasLibres: number;
  menageLibre: number;
  menageOccupe: number;
  cuisineLibre: number;
  cuisineOccupe: number;
  soldesCaisse: { devise: string; solde: number }[];
  interventionsUrgentes: number;
  sollicitationsEnAttente: number;
  fichesPoliceManquantes: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatTile icon={LogIn} value={checkInsAujourdhui} label="Check-in aujourd'hui" color="emerald" />
      <StatTile icon={LogOut} value={checkOutsAujourdhui} label="Check-out aujourd'hui" color="amber" />
      <StatTile icon={DoorClosed} value={villasOccupees} label="Villas occupées" color="sky" href="/villas" />
      <StatTile icon={DoorOpen} value={villasLibres} label="Villas libres" color="emerald" href="/villas" />
      <StatTile icon={BrushCleaning} value={menageLibre} label="Ménage disponible" color="emerald" href="/personnel" />
      <StatTile icon={BrushCleaning} value={menageOccupe} label="Ménage occupée" color="amber" href="/personnel" />
      <StatTile icon={ChefHat} value={cuisineLibre} label="Cuisine disponible" color="emerald" href="/personnel" />
      <StatTile icon={ChefHat} value={cuisineOccupe} label="Cuisine occupée" color="amber" href="/personnel" />
      {soldesCaisse.length > 0 ? (
        soldesCaisse.map((s) => (
          <StatTile
            key={s.devise}
            icon={Wallet}
            value={`${s.solde.toLocaleString("fr-FR")} ${s.devise}`}
            label="Caisse disponible"
            color={s.solde < 0 ? "red" : "slate"}
            href="/caisse"
          />
        ))
      ) : (
        <StatTile icon={Wallet} value="0" label="Caisse disponible" color="slate" href="/caisse" />
      )}
      <StatTile
        icon={AlertTriangle}
        value={interventionsUrgentes}
        label="Interventions urgentes"
        color={interventionsUrgentes > 0 ? "red" : "slate"}
        href="/interventions"
      />
      <StatTile
        icon={Hourglass}
        value={sollicitationsEnAttente}
        label="Personnel en attente"
        color={sollicitationsEnAttente > 0 ? "amber" : "slate"}
        href="/agent-ia"
      />
      <StatTile
        icon={FileWarning}
        value={fichesPoliceManquantes}
        label="Fiches police manquantes"
        color={fichesPoliceManquantes > 0 ? "red" : "slate"}
        href="/securite"
      />
    </div>
  );
}

function VillasLibresCard({
  villas,
  planVillas,
}: {
  villas: { id: string; nom: string; numero: string }[];
  planVillas: PlanVilla[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Villas libres en ce moment ({villas.length})</CardTitle>
        {/* Plan du domaine réduit à une icône sur la même ligne que le titre (au lieu d'un bloc
            "Voir le plan" permanent) — Kamel, 2026-08-17. */}
        <CardAction>
          <DomainePlanTrigger villas={planVillas} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {villas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Toutes tes villas sont occupées en ce moment.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {villas.map((v) => (
              <Link key={v.id} href={`/villas/${v.id}`}>
                {/* Juste le numéro, pas le nom de la villa (Kamel, 2026-08-17) : plus rapide à
                    scanner d'un coup d'œil, le nom reste accessible sur la fiche villa. */}
                <Badge
                  variant="outline"
                  className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  n°{v.numero}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PersonPanel({
  reservations: personReservations,
  maintenance: personMaintenance,
  days,
  now,
}: {
  reservations: ReservationRow[];
  maintenance: MaintenanceRow[];
  days: Date[];
  now: Date;
}) {
  return (
    <>
      {days.map((day) => {
        const dayCheckIns = personReservations.filter((r) => isSameDay(new Date(r.checkIn), day));
        const dayCheckOuts = personReservations.filter((r) => isSameDay(new Date(r.checkOut), day));
        const title = isToday(day) ? "Aujourd'hui" : isTomorrow(day) ? "Demain" : format(day, "EEEE", { locale: fr });

        return (
          <DayCard
            key={day.toISOString()}
            title={title}
            date={day}
            checkIns={dayCheckIns}
            checkOuts={dayCheckOuts}
          />
        );
      })}

      {personMaintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entretiens à prévoir (30 jours)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {personMaintenance.map((m) => {
              const overdue = isPast(new Date(m.prochaineDatePrevue!));
              return (
                <Link
                  key={m.id}
                  href="/maintenance"
                  className="flex items-center justify-between gap-3 rounded-md border p-3 hover:border-primary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{m.equipement}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.villaNom ? `${m.villaNom} (n°${m.villaNumero})` : "Villa non renseignée"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={overdue ? "destructive" : "outline"}>
                    {overdue ? "En retard" : "Prévu"} ·{" "}
                    {format(new Date(m.prochaineDatePrevue!), "d MMM", { locale: fr })}
                  </Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}

type MaintenanceRow = {
  id: string;
  equipement: string;
  prochaineDatePrevue: Date | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  villaType: "villa" | "appartement" | null;
  domaineNom: string | null;
};

function DayCard({
  title,
  date,
  checkIns,
  checkOuts,
}: {
  title: string;
  date: Date;
  checkIns: ReservationRow[];
  checkOuts: ReservationRow[];
}) {
  const total = checkIns.length + checkOuts.length;

  // Regroupe par domaine pour afficher les colonnes côte à côte (ex. Zaraba à
  // gauche, Moderna 2 à droite) — repérage immédiat de quel domaine est concerné.
  const domaineNames = Array.from(
    new Set([...checkIns, ...checkOuts].map((r) => r.domaineNom ?? "Sans domaine"))
  ).sort();

  const domaineGroups = domaineNames.map((domaineName) => {
    const domaineCheckIns = checkIns.filter((r) => (r.domaineNom ?? "Sans domaine") === domaineName);
    const domaineCheckOuts = checkOuts.filter((r) => (r.domaineNom ?? "Sans domaine") === domaineName);
    // Trié par horaire réel : les check-out sont le matin, les check-in l'après-midi,
    // donc ça place naturellement les check-out en premier sans règle figée.
    const items: { r: ReservationRow; kind: "in" | "out" }[] = [
      ...domaineCheckIns.map((r) => ({ r, kind: "in" as const })),
      ...domaineCheckOuts.map((r) => ({ r, kind: "out" as const })),
    ].sort(
      (a, b) =>
        new Date(a.kind === "in" ? a.r.checkIn : a.r.checkOut).getTime() -
        new Date(b.kind === "in" ? b.r.checkIn : b.r.checkOut).getTime()
    );
    return { domaineName, checkIns: domaineCheckIns, checkOuts: domaineCheckOuts, items };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2 text-base">
          <span className="capitalize">{title}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {format(date, "d MMMM", { locale: fr })}
          </span>
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              · {total} évènement{total > 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à signaler.</p>
        ) : (
          <>
            {/* Plus un pavé encadré : juste une légende légère au-dessus des cartes, moins lourd
                visuellement (Kamel, 2026-08-17 : "ça fait trop pavé"). */}
            <div className="mb-3 space-y-0.5">
              {domaineGroups.map((g) => (
                <p key={g.domaineName} className="text-xs text-muted-foreground">
                  {buildResumeDomaine(g.domaineName, g.checkIns, g.checkOuts)}
                </p>
              ))}
            </div>
            {/* Un seul domaine actif la plupart du temps : forcer 2 colonnes ici laisserait la
                moitié de l'écran vide. On ne coupe en colonnes que s'il y a vraiment plusieurs
                domaines à afficher côte à côte. */}
            <div className={cn("grid min-w-0 gap-4", domaineGroups.length > 1 && "sm:grid-cols-2")}>
              {domaineGroups.map((g) => (
                <div key={g.domaineName} className="min-w-0 space-y-2">
                  <DomaineBadge nom={g.domaineName} />
                  {/* Grille 2 colonnes sur grand écran : un turnover (check-out + check-in de la
                      même villa) occupe les 2 colonnes côte à côte ; les réservations isolées se
                      rangent naturellement 2 par 2 plutôt que de laisser l'espace vide. */}
                  <div className="grid min-w-0 gap-2 lg:grid-cols-2">
                    {groupTurnoverRows(g.items).map((row, i) =>
                      row.length === 2 ? (
                        <div key={i} className="grid min-w-0 gap-2 sm:grid-cols-2 lg:col-span-2">
                          {row.map(({ r, kind }) => (
                            <ReservationRowCard key={`${kind}-${r.id}`} r={r} kind={kind} />
                          ))}
                        </div>
                      ) : (
                        row.map(({ r, kind }) => <ReservationRowCard key={`${kind}-${r.id}`} r={r} kind={kind} />)
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Regroupe check-in et check-out de la même villa (turnover le même jour) pour les afficher
// côte à côte sur grand écran plutôt qu'empilés — les autres restent seuls sur leur ligne.
function groupTurnoverRows(
  items: { r: ReservationRow; kind: "in" | "out" }[]
): { r: ReservationRow; kind: "in" | "out" }[][] {
  const byVilla = new Map<string, { r: ReservationRow; kind: "in" | "out" }[]>();
  for (const item of items) {
    if (!item.r.villaId) continue;
    const list = byVilla.get(item.r.villaId) ?? [];
    list.push(item);
    byVilla.set(item.r.villaId, list);
  }

  const rows: { r: ReservationRow; kind: "in" | "out" }[][] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}-${item.r.id}`;
    if (seen.has(key)) continue;
    const villaGroup = item.r.villaId ? byVilla.get(item.r.villaId) : undefined;
    if (villaGroup && villaGroup.length === 2 && villaGroup[0].kind !== villaGroup[1].kind) {
      const pair = [...villaGroup].sort((a) => (a.kind === "out" ? -1 : 1));
      rows.push(pair);
      pair.forEach((p) => seen.add(`${p.kind}-${p.r.id}`));
    } else {
      rows.push([item]);
      seen.add(key);
    }
  }
  return rows;
}

// Estimation de ce qu'il faudra prévoir en liquide pour le ménage/la cuisine d'un départ,
// même si rien n'est encore confirmé fait (contrairement à cashAPrevoir, qui ne compte que ce
// qui est déjà dû) — sert à savoir combien apporter avant même d'être sur place. Un ménage
// affecté est supposé se faire (200 MAD/personne) ; une cuisine affectée est comptée sur toute
// la durée du séjour si aucun nombre de jours n'a encore été précisé. Le détail par personne est
// gardé (pas juste le total) pour l'afficher directement dans le résumé du jour.
function estimateCashDetailPourDepart(r: ReservationRow): { nom: string; montant: number }[] {
  const detail: { nom: string; montant: number }[] = [];
  for (const a of r.menageDepartAssignes) {
    if (a.payeAt || estPayeParProprietaire(r.personnelPayeParProprietaireNoms, a.nom)) continue;
    detail.push({ nom: a.nom, montant: (a.nbJours ?? 1) * TARIF_MENAGE });
  }
  for (const a of r.cuisineAssignes) {
    if (a.payeAt || estPayeParProprietaire(r.personnelPayeParProprietaireNoms, a.nom)) continue;
    const jours = a.nbJours ?? Math.max(1, differenceInCalendarDays(new Date(r.checkOut), new Date(r.checkIn)));
    const tarifJour = a.avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER;
    detail.push({ nom: a.nom, montant: jours * tarifJour });
  }
  return detail;
}

// Synthèse en une phrase de ce qu'il y a à faire dans ce domaine ce jour-là, avec le détail
// personne par personne de ce qu'il faut prévoir en liquide (ex. "Se rendre à Domaine Zaraba :
// ... Prévoir 400 MAD pour le ménage/la cuisine (Villa X : Fatiha 200 MAD, Saida 200 MAD).").
function buildResumeDomaine(domaineName: string, checkIns: ReservationRow[], checkOuts: ReservationRow[]): string {
  const parts: string[] = [];
  if (checkIns.length > 0) {
    const noms = checkIns.map((r) => r.villaNom).filter(Boolean);
    parts.push(
      `${checkIns.length} check-in${checkIns.length > 1 ? "s" : ""}${noms.length ? ` (${noms.join(", ")})` : ""}`
    );
  }
  if (checkOuts.length > 0) {
    const noms = checkOuts.map((r) => r.villaNom).filter(Boolean);
    parts.push(
      `${checkOuts.length} check-out${checkOuts.length > 1 ? "s" : ""}${noms.length ? ` (${noms.join(", ")})` : ""}`
    );
  }

  const villaDetails = checkOuts
    .map((r) => {
      const detail = estimateCashDetailPourDepart(r);
      if (detail.length === 0) return null;
      const montantTotal = detail.reduce((sum, d) => sum + d.montant, 0);
      const noms = detail.map((d) => `${d.nom} ${d.montant} MAD`).join(", ");
      return { villaNom: r.villaNom ?? "Villa", montantTotal, noms };
    })
    .filter((v): v is { villaNom: string; montantTotal: number; noms: string } => v !== null);

  const cashEstime = villaDetails.reduce((sum, v) => sum + v.montantTotal, 0);
  const cashDetail = villaDetails.map((v) => `${v.villaNom} : ${v.noms}`).join(" ; ");
  const cashSuffix = cashEstime > 0 ? ` Prévoir ${cashEstime} MAD pour le ménage/la cuisine (${cashDetail}).` : "";
  return `Se rendre à ${domaineName} : ${parts.join(" et ")}.${cashSuffix}`;
}
