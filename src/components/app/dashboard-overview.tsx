import Link from "next/link";
import { and, gte, lt, ne } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { addDays, endOfDay, format, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { BedDouble, LogIn, LogOut, type LucideIcon } from "lucide-react";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { cn } from "@/lib/utils";

// Bandeau de tête de l'accueil : salutation + "Votre journée" (arrivées, départs, voyageurs sur
// place). Le bloc "Performance du mois" / "Ce qui a besoin de vous" est passé dans la page
// Statistiques (Kamel, 2026-10-15). Le détail opérationnel (cartes de check-in/check-out par
// domaine) reste juste en dessous.
export async function DashboardOverview({ now }: { now: Date }) {
  const db = getDb();
  const user = await currentUser().catch(() => null);
  const prenom = user?.firstName ?? null;
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const resa = await db
    .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(
      and(
        ne(reservations.status, "annulee"),
        lt(reservations.checkIn, addDays(todayEnd, 1)),
        gte(reservations.checkOut, todayStart)
      )
    );

  const arrivees = resa.filter((r) => isSameDay(new Date(r.checkIn), now));
  const departs = resa.filter((r) => isSameDay(new Date(r.checkOut), now));
  const surPlace = resa.filter((r) => new Date(r.checkIn) < todayStart && new Date(r.checkOut) > todayEnd);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{prenom ? `Bonjour ${prenom}` : "Bonjour"} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {format(now, "EEEE d MMMM yyyy", { locale: fr })} — voici ce qui demande votre attention aujourd&apos;hui.
        </p>
      </div>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Votre journée</h2>
          <Link href="/calendrier?vue=jour" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Voir le calendrier du jour
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <DayStat icon={LogIn} label="Arrivées" count={arrivees.length} tone="emerald" />
          <DayStat icon={LogOut} label="Départs" count={departs.length} tone="amber" />
          <DayStat icon={BedDouble} label="Sur place" count={surPlace.length} tone="primary" />
        </div>
      </section>
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  primary: "bg-primary/10 text-primary",
} as const;

function DayStat({ icon: Icon, label, count, tone }: { icon: LucideIcon; label: string; count: number; tone: keyof typeof TONES }) {
  return (
    <Link
      href="/calendrier?vue=jour"
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 sm:p-4"
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold tabular-nums sm:text-2xl">{count}</p>
        <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
      </div>
    </Link>
  );
}
