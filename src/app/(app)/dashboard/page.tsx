import Link from "next/link";
import { and, gte, lte, or, eq, asc, isNotNull } from "drizzle-orm";
import { format, isSameDay, isPast, startOfDay, endOfDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { reservations, villas, cashEntries, maintenanceRecords } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SyncSuperhoteButton } from "@/components/app/sync-superhote-button";
import { ReservationDates } from "@/components/app/reservation-dates";
import { PaymentSummary } from "@/components/app/payment-info";
import { LogIn, LogOut, Wallet, Wrench } from "lucide-react";
import { isSuperhoteConfigured } from "@/lib/superhote/client";

export default async function DashboardPage() {
  const db = getDb();
  const now = new Date();
  const rangeStart = startOfDay(now);
  const rangeEnd = endOfDay(addDays(now, 14));

  const upcoming = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaId: villas.id,
      loyerTotal: reservations.loyerTotal,
      montantPaye: reservations.montantPaye,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(
      or(
        and(gte(reservations.checkIn, rangeStart), lte(reservations.checkIn, rangeEnd)),
        and(gte(reservations.checkOut, rangeStart), lte(reservations.checkOut, rangeEnd))
      )
    )
    .orderBy(asc(reservations.checkIn));

  const checkInsToday = upcoming.filter((r) => isSameDay(new Date(r.checkIn), now));
  const checkOutsToday = upcoming.filter((r) => isSameDay(new Date(r.checkOut), now));
  const upcomingWeek = upcoming.filter(
    (r) => !isSameDay(new Date(r.checkIn), now) && !isSameDay(new Date(r.checkOut), now)
  );

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
    })
    .from(maintenanceRecords)
    .leftJoin(villas, eq(maintenanceRecords.villaId, villas.id))
    .where(
      and(isNotNull(maintenanceRecords.prochaineDatePrevue), lte(maintenanceRecords.prochaineDatePrevue, endOfDay(addDays(now, 30))))
    )
    .orderBy(asc(maintenanceRecords.prochaineDatePrevue));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aujourd&apos;hui</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>
        {isSuperhoteConfigured() ? (
          <SyncSuperhoteButton />
        ) : (
          <Badge variant="outline">Superhote non connecté</Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>

      <ReservationGroup title="Check-in aujourd'hui" items={checkInsToday} kind="in" />
      <ReservationGroup title="Check-out aujourd'hui" items={checkOutsToday} kind="out" />
      <ReservationGroup title="Les 14 prochains jours" items={upcomingWeek} kind="both" />

      {upcomingMaintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entretiens à prévoir (30 jours)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingMaintenance.map((m) => {
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
    </div>
  );
}

type ReservationRow = {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  source: string;
  villaNom: string | null;
  villaNumero: string | null;
  villaId: string | null;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
};

function ReservationGroup({
  title,
  items,
}: {
  title: string;
  items: ReservationRow[];
  kind: "in" | "out" | "both";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien à signaler.</p>
        ) : (
          items.map((r) => (
            <Link
              key={r.id}
              href={r.villaId ? `/villas/${r.villaId}` : "#"}
              className="block rounded-md border p-3 hover:border-primary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.guestName}</p>
                <Badge variant={r.source === "superhote" ? "secondary" : "outline"}>
                  {r.source === "superhote" ? "Superhote" : "Manuel"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {r.villaNom ? `${r.villaNom} (n°${r.villaNumero})` : "Villa non renseignée"}
              </p>
              <ReservationDates checkIn={new Date(r.checkIn)} checkOut={new Date(r.checkOut)} />
              <PaymentSummary
                loyerTotal={r.loyerTotal}
                montantPaye={r.montantPaye}
                caution={r.caution}
                cautionPayee={r.cautionPayee}
              />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
