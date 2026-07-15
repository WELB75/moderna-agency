import Link from "next/link";
import { and, gte, lte, or, eq, asc, isNotNull } from "drizzle-orm";
import { format, isSameDay, isPast, isToday, isTomorrow, startOfDay, endOfDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas, domaines, cashEntries, maintenanceRecords } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncSuperhoteButton } from "@/components/app/sync-superhote-button";
import { SyncIcalButton } from "@/components/app/sync-ical-button";
import { PaymentSummary } from "@/components/app/payment-info";
import { Countdown } from "@/components/app/countdown";
import { GuestCount } from "@/components/app/guest-count";
import { LogIn, LogOut, Wallet, Wrench, Info } from "lucide-react";
import { isSuperhoteConfigured } from "@/lib/superhote/client";
import { nowInMorocco } from "@/lib/now";

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
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
      domaineNom: domaines.nom,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
      devisePaiement: reservations.devisePaiement,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(
      or(
        and(gte(reservations.checkIn, rangeStart), lte(reservations.checkIn, rangeEnd)),
        and(gte(reservations.checkOut, rangeStart), lte(reservations.checkOut, rangeEnd))
      )
    )
    .orderBy(asc(reservations.checkIn));

  const villaUpcoming = upcoming.filter((r) => r.villaType !== "appartement");
  const appartementUpcoming = upcoming.filter((r) => r.villaType === "appartement");

  const allCashEntries = await db.select().from(cashEntries);
  const balance = allCashEntries.reduce((sum, e) => {
    const amount = Number(e.montant);
    if (e.type === "remise") return sum + amount;
    return sum - amount;
  }, 0);

  const upcomingMaintenance = await db
    .select({
      id: maintenanceRecords.id,
      equipement: maintenanceRecords.equipement,
      prochaineDatePrevue: maintenanceRecords.prochaineDatePrevue,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      villaType: villas.type,
    })
    .from(maintenanceRecords)
    .leftJoin(villas, eq(maintenanceRecords.villaId, villas.id))
    .where(
      and(isNotNull(maintenanceRecords.prochaineDatePrevue), lte(maintenanceRecords.prochaineDatePrevue, endOfDay(addDays(now, 30))))
    )
    .orderBy(asc(maintenanceRecords.prochaineDatePrevue));

  const villaMaintenance = upcomingMaintenance.filter((m) => m.villaType !== "appartement");
  const appartementMaintenance = upcomingMaintenance.filter((m) => m.villaType === "appartement");

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(now, i));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cette semaine</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncIcalButton />
          {isSuperhoteConfigured() ? (
            <SyncSuperhoteButton />
          ) : (
            <Badge variant="outline">API Superhote non connectée</Badge>
          )}
        </div>
      </div>

      <Link href="/caisse">
        <Card className="transition-colors hover:border-primary/50">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{balance.toFixed(2)} DH</p>
              <p className="text-sm text-muted-foreground">Solde caisse</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Tabs defaultValue="kamel">
        <TabsList>
          <TabsTrigger value="kamel">Kamel · Villas</TabsTrigger>
          <TabsTrigger value="imene">Imène · Appartements</TabsTrigger>
        </TabsList>
        <TabsContent value="kamel" className="space-y-6 pt-2">
          <PersonPanel reservations={villaUpcoming} maintenance={villaMaintenance} days={days} now={now} />
        </TabsContent>
        <TabsContent value="imene" className="space-y-6 pt-2">
          <PersonPanel reservations={appartementUpcoming} maintenance={appartementMaintenance} days={days} now={now} />
        </TabsContent>
      </Tabs>
    </div>
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
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  villaType: "villa" | "appartement" | null;
  domaineNom: string | null;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  devisePaiement: string;
};

type MaintenanceRow = {
  id: string;
  equipement: string;
  prochaineDatePrevue: Date | null;
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  villaType: "villa" | "appartement" | null;
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
      <CardContent className="space-y-2">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à signaler.</p>
        ) : (
          <>
            {checkIns.map((r) => (
              <ReservationRowCard key={`in-${r.id}`} r={r} kind="in" />
            ))}
            {checkOuts.map((r) => (
              <ReservationRowCard key={`out-${r.id}`} r={r} kind="out" />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReservationRowCard({ r, kind }: { r: ReservationRow; kind: "in" | "out" }) {
  const target = kind === "in" ? new Date(r.checkIn) : new Date(r.checkOut);
  const isIn = kind === "in";

  return (
    <Link
      href={r.villaId ? `/villas/${r.villaId}` : "#"}
      className={
        "block rounded-md border-l-4 p-3 hover:bg-muted/50 " +
        (isIn ? "border-l-emerald-500" : "border-l-red-500")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isIn ? (
            <LogIn className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <LogOut className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <p className="truncate font-medium">{r.guestName}</p>
        </div>
        <Countdown target={target} variant={kind} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {r.domaineNom ? (
          <Badge variant="secondary" className="text-xs">
            {r.domaineNom}
          </Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"}
        </span>
        {r.canal ? <span className="text-xs text-muted-foreground">· {r.canal}</span> : null}
      </div>

      <p className={"mt-1 text-sm font-semibold " + (isIn ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
        {isIn ? "Check-in" : "Check-out"} · {format(target, "HH:mm", { locale: fr })}
      </p>

      <GuestCount nbAdultes={r.nbAdultes} nbEnfants={r.nbEnfants} />

      {r.notes ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-800 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{r.notes}</span>
        </div>
      ) : null}

      <PaymentSummary
        loyerTotal={r.loyerTotal}
        montantPaye={r.montantPaye}
        caution={r.caution}
        cautionPayee={r.cautionPayee}
        devisePaiement={r.devisePaiement}
      />
    </Link>
  );
}
