import { notFound } from "next/navigation";
import Link from "next/link";
import { and, ne, gte, lte, eq, inArray, asc } from "drizzle-orm";
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, addDays, startOfDay, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { personnel, personnelAffectations, reservations, villas, domaines } from "@/db/schema";
import { Logo } from "@/components/app/logo";
import { PublicPlanningGrid, type PublicPlanningEntry } from "@/components/app/public-planning-grid";
import { type StaffAvailability } from "@/components/app/public-staff-availability";
import { isValidPlanningToken } from "@/lib/planning-token";
import { nowInMorocco } from "@/lib/now";

// Lien public d'équipe — Kamel, 2026-08-08 : couvre les 3 domaines (Moderna II, Zaraba, Noria)
// pendant qu'il gère tout à la place d'Imane, contrairement au reste de l'app qui ne montre
// activement que Domaine Moderna II (voir domaines-actifs.ts) — volontairement PAS filtré ici,
// et cette page ne change rien à ce filtre ailleurs (le bot WhatsApp continue à ne solliciter
// que Moderna II tant que ce choix n'est pas révisé séparément).
function planningHref(token: string, date: Date): string {
  return `/planning/${token}?semaine=${format(date, "yyyy-MM-dd")}`;
}

export default async function PublicPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ semaine?: string }>;
}) {
  const { token } = await params;
  if (!isValidPlanningToken(token)) notFound();

  const { semaine } = await searchParams;
  const db = getDb();
  const now = nowInMorocco();

  const semaineAncre = semaine && /^\d{4}-\d{2}-\d{2}$/.test(semaine) ? new Date(`${semaine}T00:00:00`) : now;
  const debutSemaine = startOfWeek(semaineAncre, { weekStartsOn: 1 });
  const finSemaine = endOfWeek(debutSemaine, { weekStartsOn: 1 });

  const allPersonnel = await db.select().from(personnel).where(eq(personnel.actif, true)).orderBy(asc(personnel.nom));
  const personnelById = new Map(allPersonnel.map((p) => [p.id, p]));
  const menageOptions = allPersonnel.filter((p) => p.role === "menage").map((p) => ({ id: p.id, nom: p.nom }));
  const cuisineOptions = allPersonnel.filter((p) => p.role === "cuisine").map((p) => ({ id: p.id, nom: p.nom }));

  const planningReservations = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      villaType: villas.type,
      domaineNom: domaines.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .leftJoin(domaines, eq(villas.domaineId, domaines.id))
    .where(and(ne(reservations.status, "annulee"), lte(reservations.checkIn, finSemaine), gte(reservations.checkOut, debutSemaine)))
    .orderBy(asc(reservations.checkIn));
  const planningReservationById = new Map(planningReservations.map((r) => [r.id, r]));
  const reservationIds = planningReservations.map((r) => r.id);
  const reservationOptions = planningReservations.map((r) => ({
    id: r.id,
    villaNom: r.villaNom,
    villaNumero: r.villaNumero,
    guestName: r.guestName,
  }));

  const planningAffectations =
    reservationIds.length > 0
      ? await db.select().from(personnelAffectations).where(inArray(personnelAffectations.reservationId, reservationIds))
      : [];

  function planningPourJour(jour: Date): PublicPlanningEntry[] {
    const jourDebut = startOfDay(jour);
    const entries: PublicPlanningEntry[] = [];
    for (const a of planningAffectations) {
      const r = planningReservationById.get(a.reservationId);
      const p = personnelById.get(a.personnelId);
      if (!r) continue;
      const checkIn = new Date(r.checkIn);
      const checkOut = new Date(r.checkOut);
      const role = p?.role ?? "menage";
      const concerne =
        role === "menage" && a.moment === "depart"
          ? isSameDay(jourDebut, checkOut)
          : jourDebut >= startOfDay(addDays(checkIn, 1)) && jourDebut <= startOfDay(checkOut);
      if (!concerne) continue;
      entries.push({
        affectationId: a.id,
        villaNom: r.villaNom,
        villaNumero: r.villaNumero,
        villaType: r.villaType,
        domaineNom: r.domaineNom,
        guestName: r.guestName,
        role,
        moment: a.moment,
        personnelId: a.personnelId,
        personnelNom: p?.nom ?? "Personne retirée",
        telephone: p?.telephone ?? null,
        avecDejeuner: a.avecDejeuner,
        confirmeAt: a.confirmeAt,
        checkOut,
      });
    }
    // Ménage toujours en haut, cuisine toujours en bas — Kamel, 2026-08-10 : "plannifie les
    // cuisiniere toujours en bas et les femmes de menage toujours en haut que ce soit homogene
    // les couleurs" : avant, le tri par villa mélangeait les deux couleurs (orange/violet) sans
    // ordre stable d'une colonne à l'autre. Le nom de villa reste le tri secondaire, pour garder
    // un ordre lisible à l'intérieur de chaque groupe.
    return entries.sort((a, b) => {
      if (a.role !== b.role) return a.role === "menage" ? -1 : 1;
      return (a.villaNom ?? "").localeCompare(b.villaNom ?? "");
    });
  }

  const joursSemaine = Array.from({ length: 7 }, (_, i) => addDays(debutSemaine, i));
  const entreesAujourdhui = planningPourJour(now);
  const occupeesAujourdhuiIds = new Set(entreesAujourdhui.map((e) => e.personnelId));

  const staffAvailability: StaffAvailability[] = allPersonnel.map((p) => ({
    id: p.id,
    nom: p.nom,
    telephone: p.telephone,
    role: p.role,
    occupeAujourdhui: occupeesAujourdhuiIds.has(p.id),
  }));

  return (
    <div className="mx-auto min-h-screen w-full min-w-0 max-w-5xl space-y-6 overflow-x-hidden p-4 sm:p-8">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <Logo size={48} />
        <h1 className="text-lg font-semibold tracking-tight">Planning équipe — Ménage &amp; cuisine</h1>
        <p className="text-xs text-muted-foreground">Domaine Moderna II · Domaine Zaraba · Noria</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-lg border bg-card p-0.5">
          <Link
            href={planningHref(token, subWeeks(debutSemaine, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <p className="min-w-48 px-1.5 text-center text-sm font-medium capitalize">
            {format(debutSemaine, "d MMM", { locale: fr })} → {format(finSemaine, "d MMM yyyy", { locale: fr })}
          </p>
          <Link
            href={planningHref(token, addWeeks(debutSemaine, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Semaine suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isSameDay(debutSemaine, startOfWeek(now, { weekStartsOn: 1 })) ? (
          <Link href={`/planning/${token}`} className="text-sm text-primary underline-offset-4 hover:underline">
            Cette semaine
          </Link>
        ) : null}
      </div>

      <PublicPlanningGrid
        jours={joursSemaine.map((date) => ({ date, entries: planningPourJour(date) }))}
        now={now}
        token={token}
        menageOptions={menageOptions}
        cuisineOptions={cuisineOptions}
        reservationOptions={reservationOptions}
        staff={staffAvailability}
      />

      <p className="pt-4 text-center text-xs text-muted-foreground">Lien de planning Moderna Agency — à ne partager qu&apos;en interne.</p>
    </div>
  );
}
