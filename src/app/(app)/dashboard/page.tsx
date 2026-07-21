import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { and, gte, lte, or, eq, ne, asc, desc, isNotNull, isNull } from "drizzle-orm";
import { format, isSameDay, isPast, isToday, isTomorrow, startOfDay, endOfDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas, domaines, maintenanceRecords, superhoteSyncLog } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { PaymentSummary } from "@/components/app/payment-info";
import { Countdown } from "@/components/app/countdown";
import { GuestCount } from "@/components/app/guest-count";
import { DomaineBadge } from "@/components/app/domaine-badge";
import { PhoneLink } from "@/components/app/phone-link";
import { EditReservationTimeDialog } from "@/components/app/edit-reservation-time-dialog";
import { ValidateCheckinCheckoutButton } from "@/components/app/validate-checkin-checkout-button";
import { DomainePlanModernaII, type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";
import { LogIn, LogOut, Wrench, Info, KeyRound } from "lucide-react";
import { nowInMorocco } from "@/lib/now";
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

  const villaUpcoming = upcoming.filter((r) => r.villaType !== "appartement");
  const appartementUpcoming = upcoming.filter((r) => r.villaType === "appartement");
  const zarabaUpcoming = villaUpcoming.filter((r) => r.domaineNom === "Domaine Zaraba");
  const modernaIIUpcoming = villaUpcoming.filter((r) => r.domaineNom === "Domaine Moderna II");
  // Aimad gère Zaraba ET Noria (les appartements).
  const aimadUpcoming = [...zarabaUpcoming, ...appartementUpcoming].sort(
    (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
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
  // Même répartition que les onglets : Aimad gère Zaraba + Noria (appartements), Kamel gère Moderna II.
  const villasLibresAimad = villasLibres.filter(
    (v) => v.domaineNom === "Domaine Zaraba" || v.type === "appartement"
  );
  const villasLibresKamel = villasLibres.filter((v) => v.domaineNom === "Domaine Moderna II");

  // Plan du domaine confirmé par Kamel : le champ "numero" correspond à la position 1-17 sur le terrain.
  const modernaIIPlanVillas: PlanVilla[] = allVillas
    .filter((v) => v.domaineNom === "Domaine Moderna II")
    .map((v) => ({ id: v.id, nom: v.nom, position: parseInt(v.numero, 10), libre: !occupiedVillaIds.has(v.id) }))
    .filter((v) => !Number.isNaN(v.position));

  const villaMaintenance = upcomingMaintenance.filter((m) => m.villaType !== "appartement");
  const appartementMaintenance = upcomingMaintenance.filter((m) => m.villaType === "appartement");
  const zarabaMaintenance = villaMaintenance.filter((m) => m.domaineNom === "Domaine Zaraba");
  const modernaIIMaintenance = villaMaintenance.filter((m) => m.domaineNom === "Domaine Moderna II");
  const aimadMaintenance = [...zarabaMaintenance, ...appartementMaintenance];

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(now, i));

  const user = await currentUser();
  const userEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  const isAimad = Boolean(userEmail && userEmail === process.env.AIMAD_EMAIL?.toLowerCase());

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
          <SyncIcalButton className="w-full sm:w-auto" />
          {lastSync?.finishedAt ? (
            <p className="text-xs text-muted-foreground">
              Dernière synchro {lastSync.success === false ? "(échec)" : ""} : {format(lastSync.finishedAt, "d MMM HH:mm", { locale: fr })}
            </p>
          ) : null}
        </div>
      </div>

      {isAimad ? (
        <>
          <VillasLibresCard villas={villasLibresAimad} />
          <PersonPanel reservations={aimadUpcoming} maintenance={aimadMaintenance} days={days} now={now} />
        </>
      ) : (
        <Tabs defaultValue="kamel">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="kamel">Kamel · Moderna II</TabsTrigger>
            <TabsTrigger value="aimad">Aimad · Zaraba &amp; Noria</TabsTrigger>
          </TabsList>
          <TabsContent value="kamel" className="space-y-6 pt-2">
            <VillasLibresCard villas={villasLibresKamel} />
            <DomainePlanModernaII villas={modernaIIPlanVillas} />
            <PersonPanel reservations={modernaIIUpcoming} maintenance={modernaIIMaintenance} days={days} now={now} />
          </TabsContent>
          <TabsContent value="aimad" className="space-y-6 pt-2">
            <VillasLibresCard villas={villasLibresAimad} />
            <PersonPanel reservations={aimadUpcoming} maintenance={aimadMaintenance} days={days} now={now} />
          </TabsContent>
        </Tabs>
      )}
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

  const domaineGroups = domaineNames.map((domaineName) => ({
    domaineName,
    checkIns: checkIns.filter((r) => (r.domaineNom ?? "Sans domaine") === domaineName),
    checkOuts: checkOuts.filter((r) => (r.domaineNom ?? "Sans domaine") === domaineName),
  }));

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
            <div className="grid gap-4 sm:grid-cols-2">
              {domaineGroups.map((g) => (
                <div key={g.domaineName} className="space-y-2">
                  <DomaineBadge nom={g.domaineName} />
                  <div className="space-y-2">
                    {g.checkIns.map((r) => (
                      <ReservationRowCard key={`in-${r.id}`} r={r} kind="in" />
                    ))}
                    {g.checkOuts.map((r) => (
                      <ReservationRowCard key={`out-${r.id}`} r={r} kind="out" />
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

  return (
    <div
      className={
        "rounded-md border-l-4 " + (isIn ? "border-l-emerald-500" : "border-l-red-500")
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
        {r.guestPhone ? <PhoneLink phone={r.guestPhone} /> : <span />}
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
