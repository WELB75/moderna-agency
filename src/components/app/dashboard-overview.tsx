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
//
// 2026-10-21 : les trois compteurs ne passent à droite de la salutation qu'à partir de `lg`
// (avant : `md` avec une largeur fixe de 34rem, qui écrasait "Bonjour Kamel" en colonne d'un mot
// par ligne dès que la fenêtre faisait moins de ~1100px). En dessous, ils prennent toute la
// largeur sous la salutation.
//
// 2026-10-30 (Fouad) : plus d'emoji 👋 à côté du prénom, et sur téléphone les trois tuiles
// empilent icône + chiffre au-dessus du libellé complet (« Arrivées », « Départs », « Sur
// place ») — avant, le libellé était à côté de l'icône et finissait tronqué en « Arri… / Dé… /
// Sur… » dès 400px de large.
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="min-w-0 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
          {prenom ? `Bonjour ${prenom}` : "Bonjour"}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="capitalize">{format(now, "EEEE d MMMM yyyy", { locale: fr })}</span>
        </p>
      </div>

      <section className="min-w-0 lg:w-full lg:max-w-[30rem]" aria-label="Votre journée">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <DayStat icon={LogIn} label="Arrivées" count={arrivees.length} tone="emerald" />
          <DayStat icon={LogOut} label="Départs" count={departs.length} tone="rose" />
          <DayStat icon={BedDouble} label="Sur place" count={surPlace.length} tone="primary" />
        </div>
      </section>
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rose: "bg-red-500/10 text-red-600 dark:text-red-400",
  primary: "bg-primary/10 text-primary",
} as const;

function DayStat({ icon: Icon, label, count, tone }: { icon: LucideIcon; label: string; count: number; tone: keyof typeof TONES }) {
  return (
    <Link
      href="/calendrier?vue=jour"
      className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="flex items-center gap-2 sm:contents">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl", TONES[tone])}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
        <span className="text-xl font-semibold leading-none tabular-nums sm:hidden">{count}</span>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="hidden text-xl font-semibold tabular-nums sm:block">{count}</span>
        <span className="block whitespace-nowrap text-xs text-muted-foreground sm:truncate sm:text-[13px]">{label}</span>
      </span>
    </Link>
  );
}
