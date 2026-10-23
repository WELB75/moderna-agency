import Link from "@/components/app/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { SyncBeds24Button } from "@/components/app/sync-beds24-button";
import { LinkBeds24Button } from "@/components/app/link-beds24-button";
import { ImportSuperhoteCsvDialog } from "@/components/app/import-superhote-csv-dialog";
import { type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";
import { DomainePlanTrigger } from "@/components/app/domaine-plan-trigger";
import { DashboardOverview } from "@/components/app/dashboard-overview";
import { SuiviArrivees } from "@/components/app/suivi-arrivees";
import { type ReservationRow } from "@/components/app/reservation-row-card";
import { ReservationAgendaCard } from "@/components/app/reservation-agenda-card";
import { RowIcon, RowTitle } from "@/components/app/dashboard-ui";
import { domaineLabel } from "@/lib/domaine-labels";
import { type PersonnelAssigne } from "@/components/app/personnel-affectation-editor";
import { Wrench, ChevronLeft, ChevronRight, MoreVertical, Home } from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { lienPlateforme } from "@/lib/lien-plateforme";
import { villaEstGeree } from "@/lib/domaines-actifs";
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
  const viewAnchor = addDays(now, offsetSemaines * DAYS_AHEAD);
  const rangeStart = startOfDay(viewAnchor);
  const rangeEnd = endOfDay(addDays(viewAnchor, DAYS_AHEAD - 1));

  // Toutes les lectures indépendantes partent en même temps (une seule attente réseau vers Neon au
  // lieu d'une dizaine à la file) : la page s'affichait en ~750 ms côté serveur, surtout du temps
  // d'aller-retour base, pas du calcul.
  const [upcoming, activePersonnel, domainesCoords, qualiteById, allClients, upcomingMaintenance, allVillas, activeNow, [lastSync]] = await Promise.all([
    db
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
      rawData: reservations.rawData,
      beds24RoomId: villas.beds24RoomId,
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
    .orderBy(asc(reservations.checkIn)),
    db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom)),
    db.select({ nom: domaines.nom, latitude: domaines.latitude, longitude: domaines.longitude }).from(domaines),
    getQualiteMoyenneById(db),
    db.select({ nom: clients.nom, telephone: clients.telephone, notes: clients.notes }).from(clients),
    db
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
      .orderBy(asc(maintenanceRecords.prochaineDatePrevue)),
    db
      .select({
        id: villas.id,
        nom: villas.nom,
        numero: villas.numero,
        type: villas.type,
        domaineNom: domaines.nom,
      })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .orderBy(asc(villas.nom)),
    db
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
      ),
    db
      .select({ finishedAt: superhoteSyncLog.finishedAt, success: superhoteSyncLog.success })
      .from(superhoteSyncLog)
      .orderBy(desc(superhoteSyncLog.startedAt))
      .limit(1),
  ]);

  // Fiche police / contrat : indicateurs affichés sur chaque carte de réservation. La fiche
  // police est liée directement à la réservation (reservationId) ; le contrat n'a pas ce lien
  // en base, on le rapproche par villa + date d'arrivée identique.
  const reservationIds = upcoming.map((r) => r.id);
  const villaIdsForContrats = Array.from(new Set(upcoming.map((r) => r.villaId).filter((id): id is string => Boolean(id))));
  const [relatedFiches, relatedContrats, relatedAffectations, recapRows] = await Promise.all([
    reservationIds.length > 0
      ? db
          .select({ id: gendarmerieForms.id, reservationId: gendarmerieForms.reservationId, statut: gendarmerieForms.statut })
          .from(gendarmerieForms)
          .where(inArray(gendarmerieForms.reservationId, reservationIds))
      : [],
    villaIdsForContrats.length > 0
      ? db
          .select({
            id: contratsLocation.id,
            villaId: contratsLocation.villaId,
            dateArrivee: contratsLocation.dateArrivee,
            statut: contratsLocation.statut,
          })
          .from(contratsLocation)
          .where(inArray(contratsLocation.villaId, villaIdsForContrats))
      : [],
    reservationIds.length > 0
      ? db
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
      : [],
    reservationIds.length > 0
      ? db
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
      : [],
  ]);
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


  // Coordonnées de chaque domaine (pour trier les options ménage/cuisine par proximité, voir
  // buildPersonnelOptions), précalculées pour chaque domaine avant le rendu — plusieurs séjours
  // partagent le même domaine, pas de cache paresseux pendant le rendu.
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
      ...{ rawData: undefined }, // jamais envoyé au navigateur : seul le lien en sort
      lienPlateforme: lienPlateforme(r),
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

  const allVillasGerees = allVillas.filter((v) => villaEstGeree(v.nom));

  // Occupation réelle = check-in validé sur place mais check-out pas encore validé (pas juste
  // la période de la réservation) : reflète qui a vraiment les clés en ce moment, pas le calendrier.
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
    <div className="w-full max-w-full space-y-6">
      {/* Bloc "aujourd'hui" (salutation, compteurs du jour, suivi caution/fiche police) — seulement
          sur la semaine en cours : il parle d'aujourd'hui, pas de la semaine affichée. */}
      {offsetSemaines === 0 ? (
        <section className="space-y-4" aria-label="Aujourd'hui">
          <DashboardOverview now={now} />
          <SuiviArrivees now={now} />
        </section>
      ) : null}

      <Tabs defaultValue="Domaine Moderna II" className="gap-4">
        {/* Barre de la semaine : navigateur de semaine, domaines, options. Une seule ligne sur
            grand écran ; sur téléphone et tablette, les onglets passent sur leur propre ligne,
            pleine largeur (Kamel, 2026-10-16 : "voir directement 2-3 jours à venir sans
            scroller"). La loupe n'est plus répétée ici : la recherche est déjà dans l'en-tête. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="order-1 flex items-center gap-2">
            <div className="inline-flex h-10 items-center rounded-xl border border-border bg-card p-0.5">
              <Link
                href={offsetSemaines - 1 === 0 ? "/dashboard" : `/dashboard?semaine=${offsetSemaines - 1}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Semaine précédente"
                title="Semaine précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <h2 className="px-1 text-sm font-semibold tracking-tight sm:text-[15px]">
                {offsetSemaines === 0
                  ? "Cette semaine"
                  : `${format(rangeStart, "d MMM", { locale: fr })} – ${format(rangeEnd, "d MMM yyyy", { locale: fr })}`}
              </h2>
              <Link
                href={offsetSemaines + 1 === 0 ? "/dashboard" : `/dashboard?semaine=${offsetSemaines + 1}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Semaine suivante"
                title="Semaine suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {offsetSemaines !== 0 ? (
              <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Aujourd&apos;hui
              </Link>
            ) : null}
          </div>

          <TabsList className="order-3 h-11 w-full gap-1 rounded-xl bg-muted p-1 lg:order-2 lg:h-10 lg:w-auto lg:min-w-0 lg:max-w-md lg:flex-1">
            {DASHBOARD_DOMAINES.map((d) => (
              <TabsTrigger
                key={d}
                value={d}
                className="h-9 min-w-0 flex-1 rounded-lg px-2 text-[13px] font-semibold sm:text-sm lg:h-8 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none"
              >
                <span className="truncate">{domaineLabel(d)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Synchro/import : rarement utilisés au quotidien, repliés derrière un seul bouton. */}
          <details className="group relative order-2 ml-auto lg:order-3">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-border bg-card text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden"
              aria-label="Options"
              title="Options"
            >
              <MoreVertical className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-full z-30 mt-1.5 w-[min(18rem,calc(100vw-2rem))] space-y-2 rounded-xl border border-border bg-popover p-3 shadow-lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Synchronisation</p>
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

        {DASHBOARD_DOMAINES.map((d) => (
          <TabsContent key={d} value={d} className="space-y-6">
            {/* Un seul bloc "sur place maintenant" : tâches du jour (semaine en cours) + villas
                libres, deux lignes du même gabarit au lieu de deux cartes différentes. */}
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {offsetSemaines === 0 ? <TachesDuJour taches={tachesDuJour.filter((t) => t.domaineNom === d)} now={now} /> : null}
              <VillasLibresRow villas={villasLibresByDomaine.get(d)!} planVillas={planVillasByDomaine.get(d)!} />
            </div>

            <Agenda reservations={upcomingByDomaine.get(d)!} days={days} now={now} semaineCourante={offsetSemaines === 0} />

            <MaintenanceCard maintenance={maintenanceByDomaine.get(d)!} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// Ligne "Villas libres" : juste le numéro, pas le nom (Kamel, 2026-08-17 : plus rapide à
// scanner), et le plan du domaine en icône à droite (uniquement Moderna II, planVillas vide
// sinon).
function VillasLibresRow({
  villas,
  planVillas,
}: {
  villas: { id: string; nom: string; numero: string }[];
  planVillas: PlanVilla[];
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <RowIcon icon={Home} tone={villas.length > 0 ? "ok" : "neutre"} />
      <RowTitle
        sub={
          villas.length === 0 ? (
            "Tout est occupé en ce moment"
          ) : (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {villas.map((v) => (
                <Link key={v.id} href={`/villas/${v.id}`}>
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                    n°{v.numero}
                  </Badge>
                </Link>
              ))}
            </span>
          )
        }
      >
        Villas libres
        <span className="ml-1.5 font-normal text-muted-foreground">· {villas.length}</span>
      </RowTitle>
      {planVillas.length > 0 ? <DomainePlanTrigger villas={planVillas} /> : null}
    </div>
  );
}

// Agenda de la semaine : un en-tête par jour (collant sous la barre du haut pendant le
// défilement), puis une carte repliable par check-in / check-out, triées par heure réelle
// (les check-out le matin, les check-in l'après-midi). Les jours sans rien sont regroupés en une
// seule ligne discrète plutôt qu'une carte vide chacun.
function Agenda({
  reservations: resas,
  days,
  now,
  semaineCourante,
}: {
  reservations: ReservationRow[];
  days: Date[];
  now: Date;
  semaineCourante: boolean;
}) {
  type Item = { r: ReservationRow; kind: "in" | "out"; at: Date };
  const parJour = days.map((day) => {
    const items: Item[] = [
      ...resas.filter((r) => isSameDay(new Date(r.checkIn), day)).map((r) => ({ r, kind: "in" as const, at: new Date(r.checkIn) })),
      ...resas.filter((r) => isSameDay(new Date(r.checkOut), day)).map((r) => ({ r, kind: "out" as const, at: new Date(r.checkOut) })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
    return { day, items };
  });

  // Regroupe les jours vides consécutifs.
  const blocs: ({ type: "jour"; day: Date; items: Item[] } | { type: "vides"; days: Date[] })[] = [];
  for (const { day, items } of parJour) {
    if (items.length > 0) {
      blocs.push({ type: "jour", day, items });
    } else {
      const dernier = blocs[blocs.length - 1];
      if (dernier && dernier.type === "vides") dernier.days.push(day);
      else blocs.push({ type: "vides", days: [day] });
    }
  }

  const total = parJour.reduce((n, j) => n + j.items.length, 0);

  return (
    <section className="space-y-3" aria-label="Agenda de la semaine">
      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun check-in ni check-out sur cette semaine.
        </p>
      ) : null}
      {blocs.map((bloc) => {
        if (bloc.type === "vides") {
          const libelles = bloc.days.map((d) => libelleJour(d, semaineCourante, true));
          const texte = libelles.length === 1 ? libelles[0] : `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
          return (
            <p key={bloc.days[0].toISOString()} className="px-1 py-1 text-sm text-muted-foreground">
              <span className="capitalize">{texte}</span> : rien de prévu.
            </p>
          );
        }
        const cash = estimerCashJour(bloc.items.filter((i) => i.kind === "out").map((i) => i.r));
        const nbIn = bloc.items.filter((i) => i.kind === "in").length;
        const nbOut = bloc.items.length - nbIn;
        const aujourdhui = semaineCourante && isToday(bloc.day);
        return (
          <div key={bloc.day.toISOString()} className="space-y-2">
            <div
              className="sticky z-10 -mx-4 bg-background md:-mx-6"
              style={{ top: "calc(3.5rem + env(safe-area-inset-top))" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-muted/40 px-4 py-2 md:px-6">
                <h3 className="text-[15px] font-semibold capitalize">{libelleJour(bloc.day, semaineCourante, false)}</h3>
                <span className="text-sm text-muted-foreground">{format(bloc.day, "EEEE d MMMM", { locale: fr })}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {nbIn > 0 ? `${nbIn} arrivée${nbIn > 1 ? "s" : ""}` : null}
                  {nbIn > 0 && nbOut > 0 ? " · " : null}
                  {nbOut > 0 ? `${nbOut} départ${nbOut > 1 ? "s" : ""}` : null}
                </span>
                {cash.total > 0 ? (
                  <span
                    className="basis-full text-xs text-amber-700 dark:text-amber-400"
                    title={cash.detail}
                  >
                    Prévoir {cash.total} MAD en liquide pour le ménage/la cuisine · {cash.detail}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              {bloc.items.map(({ r, kind }) => {
                const fait = kind === "in" ? Boolean(r.checkinValideAt) : Boolean(r.checkoutValideAt);
                return <ReservationAgendaCard key={`${kind}-${r.id}`} r={r} kind={kind} defaultOpen={aujourdhui && !fait} />;
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function libelleJour(day: Date, semaineCourante: boolean, avecDate: boolean): string {
  if (semaineCourante && isToday(day)) return "Aujourd'hui";
  if (semaineCourante && isTomorrow(day)) return "Demain";
  return avecDate ? format(day, "EEEE d", { locale: fr }) : format(day, "EEEE", { locale: fr });
}

function MaintenanceCard({ maintenance }: { maintenance: MaintenanceRow[] }) {
  if (maintenance.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card" aria-label="Entretiens à prévoir">
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <RowIcon icon={Wrench} tone="attente" />
        <RowTitle sub="Sur les 30 prochains jours">
          Entretiens à prévoir
          <span className="ml-1.5 font-normal text-muted-foreground">· {maintenance.length}</span>
        </RowTitle>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {maintenance.map((m) => {
          const overdue = isPast(new Date(m.prochaineDatePrevue!));
          return (
            <li key={m.id}>
              <Link href="/maintenance" className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{m.equipement}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.villaNom ? `${m.villaNom} (n°${m.villaNumero})` : "Villa non renseignée"}
                  </span>
                </span>
                <Badge variant={overdue ? "destructive" : "outline"} className="shrink-0">
                  {overdue ? "En retard" : "Prévu"} · {format(new Date(m.prochaineDatePrevue!), "d MMM", { locale: fr })}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
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

// Total et détail du liquide à prévoir pour les départs d'un jour (ex. "Villa Nessya : Khadija
// MASLIK 800 MAD ; Villa Tania : Fatiha 200 MAD").
function estimerCashJour(departs: ReservationRow[]): { total: number; detail: string } {
  const parVilla = departs
    .map((r) => {
      const detail = estimateCashDetailPourDepart(r);
      if (detail.length === 0) return null;
      return {
        villaNom: r.villaNom ?? "Villa",
        total: detail.reduce((sum, d) => sum + d.montant, 0),
        noms: detail.map((d) => `${d.nom} ${d.montant} MAD`).join(", "),
      };
    })
    .filter((v): v is { villaNom: string; total: number; noms: string } => v !== null);
  return {
    total: parVilla.reduce((sum, v) => sum + v.total, 0),
    detail: parVilla.map((v) => `${v.villaNom} : ${v.noms}`).join(" ; "),
  };
}
