import Link from "next/link";
import { and, gte, lte, or, eq, ne, asc, desc, isNotNull, isNull, inArray } from "drizzle-orm";
import {
  format,
  isSameDay,
  isPast,
  isToday,
  isTomorrow,
  startOfDay,
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
} from "@/db/schema";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { SyncBeds24Button } from "@/components/app/sync-beds24-button";
import { LinkBeds24Button } from "@/components/app/link-beds24-button";
import { ImportSuperhoteCsvDialog } from "@/components/app/import-superhote-csv-dialog";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";
import { DomainePlanTrigger } from "@/components/app/domaine-plan-trigger";
import { MenuGrid } from "@/components/app/menu-grid";
import { DashboardOverview } from "@/components/app/dashboard-overview";
import { GlobalSearchOverlay } from "@/components/app/global-search-overlay";
import { ReservationRowCard, type ReservationRow } from "@/components/app/reservation-row-card";
import { type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import {
  Wrench,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { villaEstGeree } from "@/lib/domaines-actifs";
import { getUnreadChatCount } from "@/lib/actions/chat";
import {
  montantMenageDu,
  montantCuisineDu,
  estPayeParProprietaire,
  tarifMenageJournalier,
  TARIF_CUISINE_PETIT_DEJEUNER,
  TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER,
} from "@/lib/personnel-tarifs";
import { phonesMatch } from "@/lib/phone";
import { buildPersonnelOptions, getQualiteMoyenneById } from "@/lib/personnel-options";
import { chargerVoisins, voisinsAutour } from "@/lib/taches-du-jour";
import { reservationRecaps } from "@/db/schema-recaps";
import { TachesDuJour, type TacheJour, type TacheStatut } from "@/components/app/taches-du-jour";

const DAYS_AHEAD = 7;

// Domaines affichés en onglets sur l'accueil, dans cet ordre — Moderna II en premier (onglet par
// défaut, géré par Kamel au quotidien), puis Zaraba et Noria réintégrés depuis leur mise de côté
// du 2026-07-24 (voir domaines-actifs.ts, qui reste inchangé et ne s'applique qu'aux autres pages
// comme /caisse). "Bureau Moderna Agency" n'est pas un domaine loué (0 villa) donc pas d'onglet.
// Prestigia retiré de l'accueil le 2026-10-13 (Kamel : "retire prestigia").
const DASHBOARD_DOMAINES = ["Domaine Moderna II", "Domaine Zaraba", "Noria"];

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

  // Récapitulatifs des réservations directes (avance, reste à encaisser, remarque interne, lien).
  const recapRows =
    reservationIds.length > 0
      ? await db
          .select({
            reservationId: reservationRecaps.reservationId,
            token: reservationRecaps.token,
            devise: reservationRecaps.devise,
            avanceVersee: reservationRecaps.avanceVersee,
            totalFinal: reservationRecaps.totalFinal,
            modeReglement: reservationRecaps.modeReglement,
            remarqueInterne: reservationRecaps.remarqueInterne,
          })
          .from(reservationRecaps)
          .where(inArray(reservationRecaps.reservationId, reservationIds))
      : [];
  const recapByReservation = new Map(
    recapRows.map((x) => {
      const total = x.totalFinal ? Number(x.totalFinal) : null;
      const avance = x.avanceVersee ? Number(x.avanceVersee) : null;
      return [
        x.reservationId,
        {
          token: x.token,
          devise: x.devise,
          avanceVersee: avance,
          reste: total != null ? Math.max(0, Math.round((total - (avance ?? 0)) * 100) / 100) : null,
          modeReglement: x.modeReglement,
          remarqueInterne: x.remarqueInterne,
        },
      ] as const;
    })
  );

  const activePersonnel = await db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom));

  // Coordonnées de chaque domaine (pour trier les options ménage/cuisine par proximité, voir
  // buildPersonnelOptions), précalculées pour chaque domaine avant le rendu — plusieurs séjours
  // partagent le même domaine, pas de cache paresseux pendant le rendu.
  const domainesCoords = await db.select({ nom: domaines.nom, latitude: domaines.latitude, longitude: domaines.longitude }).from(domaines);
  const qualiteById = await getQualiteMoyenneById(db);
  const menageOptionsByDomaine = new Map(domainesCoords.map((d) => [d.nom, buildPersonnelOptions(activePersonnel, "menage", d, qualiteById)]));
  const cuisineOptionsByDomaine = new Map(domainesCoords.map((d) => [d.nom, buildPersonnelOptions(activePersonnel, "cuisine", d, qualiteById)]));
  const menageOptionsSansDomaine = buildPersonnelOptions(activePersonnel, "menage", null, qualiteById);
  const cuisineOptionsSansDomaine = buildPersonnelOptions(activePersonnel, "cuisine", null, qualiteById);
  function menageOptionsFor(domaineNom: string | null) {
    return (domaineNom && menageOptionsByDomaine.get(domaineNom)) || menageOptionsSansDomaine;
  }
  function cuisineOptionsFor(domaineNom: string | null) {
    return (domaineNom && cuisineOptionsByDomaine.get(domaineNom)) || cuisineOptionsSansDomaine;
  }

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
          ? montantMenageDu(a.faitAt, a.nbJours, { domaineNom: r.domaineNom, nbChambres: r.villaNbChambres })
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
      menageOptions: menageOptionsFor(r.domaineNom),
      cuisineOptions: cuisineOptionsFor(r.domaineNom),
      cashAPrevoir,
      clientConnu,
      recap: recapByReservation.get(r.id) ?? null,
    };
  });

  const upcomingByDomaine = new Map(
    DASHBOARD_DOMAINES.map((d) => [d, upcomingWithDocs.filter((r) => r.domaineNom === d)])
  );

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
  const villasLibresByDomaine = new Map(
    DASHBOARD_DOMAINES.map((d) => [d, villasLibres.filter((v) => v.domaineNom === d)])
  );

  // Plan du domaine confirmé par Kamel : le champ "numero" correspond à la position 1-17 sur le
  // terrain — uniquement fiable pour Moderna II (Zaraba/Noria/Prestigia ont des numéros dupliqués
  // ou inconnus côté données, donc pas de plan pour ces domaines, juste la liste des villas libres).
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
  const planVillasByDomaine = new Map<string, PlanVilla[]>([
    ["Domaine Moderna II", modernaIIPlanVillas],
    ["Domaine Zaraba", []],
    ["Noria", []],
  ]);

  const maintenanceByDomaine = new Map(
    DASHBOARD_DOMAINES.map((d) => [d, upcomingMaintenance.filter((m) => m.domaineNom === d)])
  );

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(viewAnchor, i));

  const [lastSync] = await db
    .select({ finishedAt: superhoteSyncLog.finishedAt, success: superhoteSyncLog.success })
    .from(superhoteSyncLog)
    .orderBy(desc(superhoteSyncLog.startedAt))
    .limit(1);

  // Tâches du jour (une ligne par check-out, ménage de départ, check-in, cuisine) avec dernier
  // départ / prochaine arrivée de la villa — uniquement sur la semaine en cours.
  const tachesDuJour: TacheJour[] = [];
  if (offsetSemaines === 0) {
    const duJour = upcomingWithDocs.filter((r) => isSameDay(new Date(r.checkIn), now) || isSameDay(new Date(r.checkOut), now));
    const voisins = await chargerVoisins(
      Array.from(new Set(duJour.map((r) => r.villaId).filter((id): id is string => Boolean(id)))),
      now
    );
    const statutPersonnel = (assignes: { faitAt: Date | null }[]): TacheStatut =>
      assignes.length === 0 ? "non_assigne" : assignes.every((a) => a.faitAt) ? "fait" : "assigne";
    for (const r of duJour) {
      const liste = r.villaId ? (voisins.get(r.villaId) ?? []) : [];
      const base = {
        reservationId: r.id,
        villaNom: r.villaNom,
        villaNumero: r.villaNumero,
        villaPhotoUrl: r.villaPhotoUrl,
        domaineNom: r.domaineNom,
      };
      if (isSameDay(new Date(r.checkOut), now)) {
        const at = new Date(r.checkOut);
        const autour = voisinsAutour(liste, at);
        tachesDuJour.push({
          ...base,
          key: `out-${r.id}`,
          type: "checkout",
          at,
          statut: r.checkoutValideAt ? "fait" : "a_faire",
          personnes: r.checkoutValidePar ? [r.checkoutValidePar] : [],
          extra: [],
          ...autour,
        });
        tachesDuJour.push({
          ...base,
          key: `menage-${r.id}`,
          type: "menage",
          at,
          statut: statutPersonnel(r.menageDepartAssignes),
          personnes: r.menageDepartAssignes.map((a) => a.nom),
          extra: [],
          ...autour,
        });
      }
      if (isSameDay(new Date(r.checkIn), now)) {
        const at = new Date(r.checkIn);
        const autour = voisinsAutour(liste, at);
        tachesDuJour.push({
          ...base,
          key: `in-${r.id}`,
          type: "checkin",
          at,
          // Fiche police complète + contrat signé mais check-in pas encore validé : le dire
          // clairement plutôt que "À faire" (Kamel, 2026-10-15 : "j'ai tout fait pourquoi c'est
          // écrit à faire ?").
          statut: r.checkinValideAt
            ? "fait"
            : r.ficheStatut === "complete" && r.contratStatut === "signe"
              ? "a_valider"
              : "a_faire",
          personnes: r.checkinValidePar ? [r.checkinValidePar] : [],
          extra: [
            { label: "Fiche police", ok: r.ficheStatut === "complete" },
            { label: "Contrat", ok: r.contratStatut === "signe" },
          ],
          ...autour,
        });
        if (r.cuisineAssignes.length > 0) {
          tachesDuJour.push({
            ...base,
            key: `cuisine-${r.id}`,
            type: "cuisine",
            at,
            statut: statutPersonnel(r.cuisineAssignes),
            personnes: r.cuisineAssignes.map((a) => a.nom),
            extra: [],
            ...autour,
          });
        }
      }
    }
    tachesDuJour.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      {/* Vue d'ensemble façon SuperHote v2 (performance du mois, actions à traiter, journée) —
          seulement sur la semaine en cours : elle parle d'aujourd'hui, pas de la semaine affichée. */}
      {offsetSemaines === 0 ? (
        <>
          <DashboardOverview now={now} />
          <h2 className="border-t pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Opérations de la semaine
          </h2>
        </>
      ) : null}
      {/* Une seule ligne de tête : navigateur de semaine + date en ligne (plus dessous), toutes
          les icônes regroupées à droite — Kamel, 2026-09-08 : "je veux qu'il y ait toutes les
          icônes listé là en haut [...] la date [...] tu me la mets propre sur le côté à côté de
          cette semaine [...] raffiner vraiment partout". */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
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
          <span className="text-sm text-muted-foreground">{format(now, "EEEE d MMMM yyyy", { locale: fr })}</span>
          {offsetSemaines !== 0 ? (
            <Link href="/dashboard" className="text-sm text-primary underline-offset-4 hover:underline">
              Aujourd&apos;hui
            </Link>
          ) : null}
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
                <LinkBeds24Button className="w-full" />
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

      {/* Le domaine consulté détermine tout ce qui suit (check-in/out, villas libres, planning) —
          Kamel, 2026-09-08 : "met les domaine en tout premier en haut stp, c'est le plus
          important" : tout en haut de page, avant même les chiffres partagés. */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Domaine</p>
        <Tabs defaultValue="Domaine Moderna II">
          <TabsList className="h-11 w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-muted p-1">
            {DASHBOARD_DOMAINES.map((d) => (
              <TabsTrigger
                key={d}
                value={d}
                className="h-9 shrink-0 rounded-md px-4 text-sm font-semibold data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
              >
                {d}
              </TabsTrigger>
            ))}
          </TabsList>

        {DASHBOARD_DOMAINES.map((d) => (
          <TabsContent key={d} value={d} className="space-y-6 pt-2">
            {offsetSemaines === 0 ? (
              <TachesDuJour taches={tachesDuJour.filter((t) => t.domaineNom === d)} now={now} />
            ) : null}
            <VillasLibresCard villas={villasLibresByDomaine.get(d)!} planVillas={planVillasByDomaine.get(d)!} />
            <PersonPanel
              reservations={upcomingByDomaine.get(d)!}
              maintenance={maintenanceByDomaine.get(d)!}
              days={days}
              now={now}
            />
          </TabsContent>
        ))}
        </Tabs>
      </div>
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
            "Voir le plan" permanent) — Kamel, 2026-08-17. Uniquement pour Moderna II, seul domaine
            avec des positions de villas fiables (planVillas vide sinon). */}
        {planVillas.length > 0 ? (
          <CardAction>
            <DomainePlanTrigger villas={planVillas} />
          </CardAction>
        ) : null}
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
            {/* Vue horizontale (Kamel, 2026-10-13) : une carte pleine largeur par check-in /
                check-out, empilées par heure — plus compact que deux colonnes de cartes hautes. */}
            <div className="min-w-0 space-y-4">
              {domaineGroups.map((g) => (
                <div key={g.domaineName} className="min-w-0 space-y-2">
                  <DomaineBadge nom={g.domaineName} />
                  <div className="space-y-2">
                    {g.items.map(({ r, kind }) => (
                      <ReservationRowCard key={`${kind}-${r.id}`} r={r} kind={kind} layout="horizontal" />
                    ))}
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
    detail.push({ nom: a.nom, montant: (a.nbJours ?? 1) * tarifMenageJournalier({ domaineNom: r.domaineNom, nbChambres: r.villaNbChambres }) });
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
