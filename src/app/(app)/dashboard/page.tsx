import Link from "next/link";
import { and, gte, lte, or, eq, ne, asc, desc, isNotNull, isNull, inArray } from "drizzle-orm";
import { format, isSameDay, isPast, isToday, isTomorrow, startOfDay, endOfDay, addDays } from "date-fns";
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
} from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { ImportSuperhoteCsvDialog } from "@/components/app/import-superhote-csv-dialog";
import { PaymentSummary } from "@/components/app/payment-info";
import { Countdown } from "@/components/app/countdown";
import { GuestCount } from "@/components/app/guest-count";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { PhoneLink } from "@/components/app/phone-link";
import { CheckinMessageButton } from "@/components/app/checkin-message-button";
import { FichePoliceMessageButton } from "@/components/app/fiche-police-message-button";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";
import { ValidateCheckinCheckoutButton } from "@/components/app/validate-checkin-checkout-button";
import { DomainePlanModernaII, type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";
import { LogIn, LogOut, Wrench, Info, KeyRound, FileText, FileSignature, Sparkles, ChefHat, type LucideIcon } from "lucide-react";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";
import { phonesMatch } from "@/lib/phone";

const DAYS_AHEAD = 7;

export default async function DashboardPage() {
  const db = getDb();
  const now = nowInMorocco();
  const rangeStart = startOfDay(now);
  const rangeEnd = endOfDay(addDays(now, DAYS_AHEAD - 1));

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
      codeBoitier: villas.codeBoitier,
      numeroImmeuble: villas.numeroImmeuble,
      proprietaireTelephone: villas.proprietaireTelephone,
      domaineNom: domaines.nom,
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
          .select({ villaId: contratsLocation.villaId, dateArrivee: contratsLocation.dateArrivee, statut: contratsLocation.statut })
          .from(contratsLocation)
          .where(inArray(contratsLocation.villaId, villaIdsForContrats))
      : [];
  const contratStatutByVillaAndDate = new Map<string, "signe" | "en_attente">();
  for (const c of relatedContrats) {
    if (!c.villaId || !c.dateArrivee) continue;
    const key = `${c.villaId}|${c.dateArrivee}`;
    const current = contratStatutByVillaAndDate.get(key);
    if (c.statut === "signe" || current !== "signe") {
      contratStatutByVillaAndDate.set(key, c.statut === "signe" ? "signe" : "en_attente");
    }
  }

  // Ménage/cuisine : qui est affecté à ce séjour, pour le voir directement sur la carte
  // sans devoir aller sur la page Personnel.
  const relatedAffectations =
    reservationIds.length > 0
      ? await db
          .select({
            reservationId: personnelAffectations.reservationId,
            nom: personnel.nom,
            role: personnel.role,
          })
          .from(personnelAffectations)
          .innerJoin(personnel, eq(personnelAffectations.personnelId, personnel.id))
          .where(inArray(personnelAffectations.reservationId, reservationIds))
      : [];
  const menageNomsByReservation = new Map<string, string[]>();
  const cuisineNomsByReservation = new Map<string, string[]>();
  for (const a of relatedAffectations) {
    const map = a.role === "menage" ? menageNomsByReservation : cuisineNomsByReservation;
    const list = map.get(a.reservationId) ?? [];
    list.push(a.nom);
    map.set(a.reservationId, list);
  }

  const upcomingWithDocs = upcoming.map((r) => {
    const ficheStatut = ficheStatutByReservation.get(r.id) ?? null;
    const ficheId = ficheIdByReservation.get(r.id) ?? null;
    const dateKey = r.villaId ? `${r.villaId}|${format(new Date(r.checkIn), "yyyy-MM-dd")}` : null;
    const contratStatut = dateKey ? (contratStatutByVillaAndDate.get(dateKey) ?? null) : null;
    const menageNoms = menageNomsByReservation.get(r.id) ?? [];
    const cuisineNoms = cuisineNomsByReservation.get(r.id) ?? [];
    return { ...r, ficheStatut, ficheId, contratStatut, menageNoms, cuisineNoms };
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

  // Occupation réelle = check-in validé sur place mais check-out pas encore validé (pas juste
  // la période de la réservation) : reflète qui a vraiment les clés en ce moment, pas le calendrier.
  const activeNow = await db
    .select({ villaId: reservations.villaId })
    .from(reservations)
    .where(
      and(
        ne(reservations.status, "annulee"),
        isNotNull(reservations.checkinValideAt),
        isNull(reservations.checkoutValideAt)
      )
    );
  const occupiedVillaIds = new Set(activeNow.map((r) => r.villaId));
  const villasLibres = allVillas.filter((v) => !occupiedVillaIds.has(v.id));
  const villasLibresKamel = villasLibres.filter((v) => v.domaineNom === "Domaine Moderna II");

  // Plan du domaine confirmé par Kamel : le champ "numero" correspond à la position 1-17 sur le terrain.
  const modernaIIPlanVillas: PlanVilla[] = allVillas
    .filter((v) => v.domaineNom === "Domaine Moderna II")
    .map((v) => ({ id: v.id, nom: v.nom, position: parseInt(v.numero, 10), libre: !occupiedVillaIds.has(v.id) }))
    .filter((v) => !Number.isNaN(v.position));

  const modernaIIMaintenance = upcomingMaintenance.filter((m) => m.domaineNom === "Domaine Moderna II");

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(now, i));

  const [lastSync] = await db
    .select({ finishedAt: superhoteSyncLog.finishedAt, success: superhoteSyncLog.success })
    .from(superhoteSyncLog)
    .orderBy(desc(superhoteSyncLog.startedAt))
    .limit(1);

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cette semaine</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <SyncIcalButton className="w-full sm:w-auto" />
            <ImportSuperhoteCsvDialog />
          </div>
          {lastSync?.finishedAt ? (
            <p className="text-xs text-muted-foreground">
              Dernière synchro {lastSync.success === false ? "(échec)" : ""} : {format(lastSync.finishedAt, "d MMM HH:mm", { locale: fr })}
            </p>
          ) : null}
        </div>
      </div>

      <VillasLibresCard villas={villasLibresKamel} />
      <DomainePlanModernaII villas={modernaIIPlanVillas} />
      <PersonPanel reservations={modernaIIUpcoming} maintenance={modernaIIMaintenance} days={days} now={now} />
    </div>
  );
}

function VillasLibresCard({ villas }: { villas: { id: string; nom: string; numero: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Villas libres en ce moment ({villas.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {villas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Toutes tes villas sont occupées en ce moment.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {villas.map((v) => (
              <Link key={v.id} href={`/villas/${v.id}`}>
                <Badge
                  variant="outline"
                  className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  {v.nom} (n°{v.numero})
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
  const checkInsToday = personReservations.filter((r) => isSameDay(new Date(r.checkIn), now));
  const checkOutsToday = personReservations.filter((r) => isSameDay(new Date(r.checkOut), now));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <LogIn className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{checkInsToday.length}</p>
              <p className="text-sm text-muted-foreground">Check-in aujourd&apos;hui</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <LogOut className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{checkOutsToday.length}</p>
              <p className="text-sm text-muted-foreground">Check-out aujourd&apos;hui</p>
            </div>
          </CardContent>
        </Card>
      </div>

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

type ReservationRow = {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  source: string;
  canal: string | null;
  notes: string | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  guestPhone: string | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  villaType: "villa" | "appartement" | null;
  codeBoitier: string | null;
  numeroImmeuble: string | null;
  proprietaireTelephone: string | null;
  domaineNom: string | null;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  devisePaiement: string;
  checkinValideAt: Date | null;
  checkinValidePar: string | null;
  checkoutValideAt: Date | null;
  checkoutValidePar: string | null;
  aRelancer: boolean;
  ficheStatut: "complete" | "en_attente" | null;
  ficheId: string | null;
  contratStatut: "signe" | "en_attente" | null;
  menageNoms: string[];
  cuisineNoms: string[];
};

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
            <div className="mb-4 space-y-1 rounded-md bg-muted/40 p-3 text-sm">
              {domaineGroups.map((g) => (
                <p key={g.domaineName}>{buildResumeDomaine(g.domaineName, g.checkIns, g.checkOuts)}</p>
              ))}
            </div>
            {/* Un seul domaine actif la plupart du temps : forcer 2 colonnes ici laisserait la
                moitié de l'écran vide. On ne coupe en colonnes que s'il y a vraiment plusieurs
                domaines à afficher côte à côte. */}
            <div className={cn("grid gap-4", domaineGroups.length > 1 && "sm:grid-cols-2")}>
              {domaineGroups.map((g) => (
                <div key={g.domaineName} className="space-y-2">
                  <DomaineBadge nom={g.domaineName} />
                  {/* Grille 2 colonnes sur grand écran : un turnover (check-out + check-in de la
                      même villa) occupe les 2 colonnes côte à côte ; les réservations isolées se
                      rangent naturellement 2 par 2 plutôt que de laisser l'espace vide. */}
                  <div className="grid gap-2 lg:grid-cols-2">
                    {groupTurnoverRows(g.items).map((row, i) =>
                      row.length === 2 ? (
                        <div key={i} className="grid gap-2 sm:grid-cols-2 lg:col-span-2">
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

// Synthèse en une phrase de ce qu'il y a à faire dans ce domaine ce jour-là
// (ex. "Se rendre à Domaine Zaraba : 1 check-in (Villa Azur) et 2 check-out (Villa X, Villa Y).").
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
  return `Se rendre à ${domaineName} : ${parts.join(" et ")}.`;
}

function ReservationRowCard({ r, kind }: { r: ReservationRow; kind: "in" | "out" }) {
  const target = kind === "in" ? new Date(r.checkIn) : new Date(r.checkOut);
  const isIn = kind === "in";
  const isProprietaire = phonesMatch(r.guestPhone, r.proprietaireTelephone);
  const isDone = Boolean(isIn ? r.checkinValideAt : r.checkoutValideAt);

  return (
    <div
      className={
        "rounded-md border-l-4 transition-opacity " +
        (isIn ? "border-l-emerald-500" : "border-l-red-500") +
        (isDone ? " opacity-50" : "")
      }
    >
      <Link href={r.villaId ? `/villas/${r.villaId}` : "#"} className="block p-3 hover:bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {isIn ? (
              <LogIn className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <p className="truncate font-medium">{r.guestName}</p>
            {isProprietaire ? (
              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                Propriétaire
              </Badge>
            ) : null}
            {r.aRelancer ? <Badge variant="destructive">À relancer</Badge> : null}
          </div>
          <Countdown target={target} variant={kind} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">
            {r.villaNom
              ? `${r.villaNom} (${r.villaType === "appartement" ? "appt" : "villa"} n°${r.villaNumero})`
              : "Logement non renseigné"}
          </span>
          {r.villaType === "appartement" && r.numeroImmeuble ? (
            <Badge variant="outline" className="text-xs">
              Immeuble {r.numeroImmeuble}
            </Badge>
          ) : null}
          {r.codeBoitier ? (
            <Badge variant="outline" className="gap-1 text-xs font-semibold tracking-wide">
              <KeyRound className="h-3 w-3" />
              {r.codeBoitier}
            </Badge>
          ) : null}
          {r.canal ? <span className="text-xs text-muted-foreground">· {r.canal}</span> : null}
        </div>

        <p className={"mt-1 text-sm font-semibold " + (isIn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
          {isIn ? "Check-in" : "Check-out"} · {format(target, "HH:mm", { locale: fr })}
          {isIn ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              (départ le {format(new Date(r.checkOut), "d MMM", { locale: fr })})
            </span>
          ) : null}
        </p>

        <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {isProprietaire ? null : (
            <>
              <StatusChip
                icon={FileText}
                label="Fiche police"
                value={r.ficheStatut === "complete" ? "Faite" : r.ficheStatut === "en_attente" ? "En attente" : "Manquante"}
                done={r.ficheStatut === "complete"}
              />
              <StatusChip
                icon={FileSignature}
                label="Contrat"
                value={r.contratStatut === "signe" ? "Signé" : r.contratStatut === "en_attente" ? "En attente" : "Manquant"}
                done={r.contratStatut === "signe"}
              />
            </>
          )}
          <StatusChip
            icon={Sparkles}
            label="Ménage"
            value={r.menageNoms.length > 0 ? r.menageNoms.join(", ") : "Non affecté"}
            done={r.menageNoms.length > 0}
          />
          {r.cuisineNoms.length > 0 ? (
            <StatusChip icon={ChefHat} label="Cuisine" value={r.cuisineNoms.join(", ")} done />
          ) : null}
        </div>

        {r.notes ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{r.notes}</span>
          </div>
        ) : null}

        {isProprietaire ? null : (
          <PaymentSummary
            loyerTotal={r.loyerTotal}
            montantPaye={r.montantPaye}
            caution={r.caution}
            cautionPayee={r.cautionPayee}
            devisePaiement={r.devisePaiement}
          />
        )}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.guestPhone ? <PhoneLink phone={r.guestPhone} /> : null}
          {r.guestPhone && kind === "in" && !isProprietaire ? (
            <CheckinMessageButton phone={r.guestPhone} guestName={r.guestName} checkIn={new Date(r.checkIn)} now={nowInMorocco()} />
          ) : null}
          {r.guestPhone && kind === "in" && !isProprietaire && r.villaId && r.ficheStatut !== "complete" ? (
            <FichePoliceMessageButton reservationId={r.id} villaId={r.villaId} phone={r.guestPhone} ficheId={r.ficheId} />
          ) : null}
        </div>
        <EditReservationTimeDialog
          reservationId={r.id}
          checkIn={new Date(r.checkIn)}
          checkOut={new Date(r.checkOut)}
        />
      </div>
      <div className="px-3 pb-3">
        <ValidateCheckinCheckoutButton
          reservationId={r.id}
          kind={kind}
          valideAt={kind === "in" ? r.checkinValideAt : r.checkoutValideAt}
          validePar={kind === "in" ? r.checkinValidePar : r.checkoutValidePar}
        />
      </div>
    </div>
  );
}

// Petit statut compact (icône + libellé + valeur) en grille, pour remplacer l'empilement de
// badges pilule : plus lisible d'un coup d'œil, groupe visuellement tous les indicateurs.
function StatusChip({
  icon: Icon,
  label,
  value,
  done,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        done
          ? "border-emerald-500/30 bg-emerald-500/5 dark:border-emerald-500/20"
          : "border-amber-500/30 bg-amber-500/5 dark:border-amber-500/20"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">{label} · </span>
        <span className="font-medium text-foreground">{value}</span>
      </span>
    </div>
  );
}
