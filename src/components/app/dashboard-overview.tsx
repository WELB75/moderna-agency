import Link from "next/link";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { addDays, addMonths, endOfDay, format, isSameDay, startOfDay, startOfMonth, startOfYear } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  FileWarning,
  Gauge,
  HandCoins,
  LogIn,
  LogOut,
  MessageCircle,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/db";
import { domaines, gendarmerieForms, interventions, reservations, villas } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { montantProrata, nuiteesDansLeMois, versEuros } from "@/lib/logement-stats";
import { cn } from "@/lib/utils";
import { cautionEnAttente, estImpayee } from "@/lib/reservation-alerts";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Bandeau de tête de l'accueil, sur le modèle du tableau de bord SuperHote v2 :
// 1. "Performance du mois" — taux d'occupation, CA du mois, CA depuis le 1er janvier,
//    réservations du mois (mêmes règles de calcul que la page Statistiques : nuits et loyers au
//    prorata du mois, montants convertis en euros).
// 2. "Ce qui a besoin de vous" — uniquement ce qui demande une action (impayés, cautions,
//    messages, fiches police, interventions urgentes), avec un lien direct pour agir.
// 3. "Aujourd'hui chez vous" — arrivées, départs et voyageurs sur place.
// Le détail opérationnel (cartes de check-in/check-out par domaine) reste juste en dessous.
export async function DashboardOverview({ now, unreadChatCount }: { now: Date; unreadChatCount: number }) {
  const db = getDb();
  const user = await currentUser().catch(() => null);
  const prenom = user?.firstName ?? null;
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const debutMois = startOfMonth(now);
  const debutAnnee = startOfYear(now);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  const logements = (
    await db
      .select({ id: villas.id, nom: villas.nom, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((v) => domaineEstActif(v.domaineNom) && villaEstGeree(v.nom));
  const logementIds = new Set(logements.map((v) => v.id));

  // Toutes les réservations qui touchent l'année en cours (pour le CA cumulé) — le mois en cours
  // et "aujourd'hui" en sont des sous-ensembles, un seul aller-retour base suffit.
  const resaToutes = await db
      .select({
        id: reservations.id,
        villaId: reservations.villaId,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        canal: reservations.canal,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        caution: reservations.caution,
        cautionPayee: reservations.cautionPayee,
        devisePaiement: reservations.devisePaiement,
      })
      .from(reservations)
      .where(
        and(
          ne(reservations.status, "annulee"),
          lt(reservations.checkIn, addDays(todayEnd, 31)),
          gte(reservations.checkOut, debutAnnee)
        )
      );
  // Les KPI du mois suivent les règles de la page Statistiques (logements gérés des domaines
  // actifs uniquement) ; les actions et la journée portent sur toutes les réservations, comme les
  // vues Jour/Liste du calendrier vers lesquelles elles renvoient.
  const resaAnnee = resaToutes.filter((r) => r.villaId && logementIds.has(r.villaId));

  // --- Performance du mois ---------------------------------------------------------------------
  let nuiteesMois = 0;
  let caMois = 0;
  let caAnnee = 0;
  let reservationsDuMois = 0;
  for (const r of resaAnnee) {
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
    nuiteesMois += nuiteesDansLeMois(checkIn, checkOut, year, monthIndex);
    if (checkIn >= debutMois && checkIn < addMonths(debutMois, 1)) {
      reservationsDuMois++;
    }
    if (loyer > 0) {
      caMois += versEuros(montantProrata(loyer, checkIn, checkOut, year, monthIndex), r.devisePaiement);
      for (let m = 0; m <= monthIndex; m++) {
        caAnnee += versEuros(montantProrata(loyer, checkIn, checkOut, year, m), r.devisePaiement);
      }
    }
  }
  const joursDansLeMois = new Date(year, monthIndex + 1, 0).getDate();
  const nuitsDisponibles = logements.length * joursDansLeMois;
  const tauxOccupation = nuitsDisponibles > 0 ? (nuiteesMois / nuitsDisponibles) * 100 : 0;

  // --- Ce qui a besoin de vous -----------------------------------------------------------------
  const impayees = resaToutes.filter((r) => estImpayee(r, now));
  const cautions = resaToutes.filter((r) => cautionEnAttente(r, now));

  const arrivees = resaToutes.filter((r) => isSameDay(new Date(r.checkIn), now));
  const departs = resaToutes.filter((r) => isSameDay(new Date(r.checkOut), now));
  const surPlace = resaToutes.filter((r) => new Date(r.checkIn) < todayStart && new Date(r.checkOut) > todayEnd);

  const arriveeIds = arrivees.map((r) => r.id);
  const fichesCompletes =
    arriveeIds.length > 0
      ? await db
          .select({ reservationId: gendarmerieForms.reservationId })
          .from(gendarmerieForms)
          .where(and(inArray(gendarmerieForms.reservationId, arriveeIds), eq(gendarmerieForms.statut, "complete")))
      : [];
  const ficheCompleteIds = new Set(fichesCompletes.map((f) => f.reservationId));
  const fichesManquantes = arrivees.filter((r) => !ficheCompleteIds.has(r.id));

  const urgences = await db
    .select({ id: interventions.id })
    .from(interventions)
    .where(and(inArray(interventions.urgence, ["haute", "critique"]), ne(interventions.etape, "termine")));

  const lienPour = (liste: { id: string }[], filtre: string) =>
    liste.length === 1 ? `/reservations/${liste[0].id}` : `/calendrier?vue=liste&filtre=${filtre}`;

  const actions: ActionTile[] = [
    {
      label: "Réservations impayées",
      count: impayees.length,
      icon: HandCoins,
      cta: "Encaisser",
      href: lienPour(impayees, "impayees"),
    },
    {
      label: "Cautions non reçues",
      count: cautions.length,
      icon: ShieldAlert,
      cta: "Encaisser",
      href: lienPour(cautions, "cautions"),
    },
    { label: "Messages non lus", count: unreadChatCount, icon: MessageCircle, cta: "Répondre", href: "/chat" },
    {
      label: "Fiches police à compléter",
      count: fichesManquantes.length,
      icon: FileWarning,
      cta: "Compléter",
      href: "/calendrier?vue=jour",
    },
    { label: "Interventions urgentes", count: urgences.length, icon: AlertTriangle, cta: "Voir", href: "/interventions" },
  ];
  const actionsAFaire = actions.filter((a) => a.count > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{prenom ? `Bonjour ${prenom}` : "Bonjour"} 👋</h1>
        <p className="text-sm text-muted-foreground">
          {format(now, "EEEE d MMMM yyyy", { locale: fr })} — voici ce qui demande votre attention aujourd&apos;hui.
        </p>
      </div>

      <section className="space-y-2.5">
        <SectionHeader title="Performance du mois" href="/statistiques" linkLabel="Statistiques" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          <KpiTile icon={Gauge} label="Taux d'occupation" value={tauxOccupation.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} unit="%" />
          <KpiTile icon={Wallet} label={`CA de ${format(now, "MMMM", { locale: fr })}`} value={euros.format(caMois)} unit="€" />
          <KpiTile icon={HandCoins} label={`Depuis le 1ᵉʳ janvier ${year}`} value={euros.format(caAnnee)} unit="€" />
          <KpiTile icon={CalendarDays} label="Réservations du mois" value={String(reservationsDuMois)} />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHeader title="Ce qui a besoin de vous" />
        {actionsAFaire.length === 0 ? (
          <div className="rounded-xl border bg-card px-4 py-5 text-sm text-muted-foreground">
            Rien d&apos;urgent : tout est à jour pour aujourd&apos;hui.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {actionsAFaire.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="group flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <a.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{a.label}</p>
                    <p className="text-2xl font-semibold tabular-nums">{a.count}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {a.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <SectionHeader title="Votre journée" href="/calendrier?vue=jour" linkLabel="Voir le calendrier du jour" />
        <div className="grid grid-cols-3 gap-3">
          <DayStat icon={LogIn} label="Arrivées" count={arrivees.length} tone="emerald" />
          <DayStat icon={LogOut} label="Départs" count={departs.length} tone="amber" />
          <DayStat icon={BedDouble} label="Sur place" count={surPlace.length} tone="primary" />
        </div>
      </section>
    </div>
  );
}

type ActionTile = { label: string; count: number; icon: LucideIcon; cta: string; href: string };

function SectionHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
      {href && linkLabel ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, unit }: { icon: LucideIcon; label: string; value: string; unit?: string }) {
  return (
    <div className="space-y-2 bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-background">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="first-letter:uppercase">{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
        {unit ? <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span> : null}
      </p>
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
