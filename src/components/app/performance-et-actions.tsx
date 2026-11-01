import Link from "next/link";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { addDays, addMonths, endOfDay, format, isSameDay, startOfMonth, startOfYear } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  FileWarning,
  BedDouble,
  Gauge,
  HandCoins,
  MessageCircle,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/db";
import { domaines, gendarmerieForms, interventions, reservations, villas } from "@/db/schema";
import { domaineEstActif, villaEstGeree } from "@/lib/domaines-actifs";
import { montantProrata, nuiteesDansLeMois, versEuros } from "@/lib/logement-stats";
import { getMadParEur } from "@/lib/devises";
import { cautionEnAttente, estImpayee } from "@/lib/reservation-alerts";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Bloc "Performance du mois" + "Ce qui a besoin de vous", déplacé de l'accueil vers la page
// Statistiques (Kamel, 2026-10-15 : "retire ça du tableau de bord dans l'accueil, tu le mets dans
// statistiques"). Mêmes règles de calcul que le tableau Statistiques : nuits et loyers au prorata
// du mois, montants convertis en euros.
export async function PerformanceEtActions({ now, unreadChatCount }: { now: Date; unreadChatCount: number }) {
  const db = getDb();
  const madParEur = await getMadParEur();
  const todayEnd = endOfDay(now);
  const debutAnnee = startOfYear(now);
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const moisDernier = addMonths(startOfMonth(now), -1);
  // Fenêtre élargie à l'année précédant le mois dernier (en janvier, mois dernier = décembre N-1,
  // référence = décembre N-2) : un seul aller-retour base pour les comparaisons N-1.
  const debutFenetre = new Date(moisDernier.getFullYear() - 1, 0, 1);

  const logements = (
    await db
      .select({ id: villas.id, nom: villas.nom, domaineNom: domaines.nom })
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
  ).filter((v) => domaineEstActif(v.domaineNom) && villaEstGeree(v.nom));
  const logementIds = new Set(logements.map((v) => v.id));

  // Toutes les réservations qui touchent la fenêtre (année en cours, mois dernier et leurs
  // références N-1) — un seul aller-retour base suffit.
  const resaFenetre = await db
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
          gte(reservations.checkOut, debutFenetre)
        )
      );
  // Les KPI du mois suivent les règles de la page Statistiques (logements gérés des domaines
  // actifs uniquement) ; les actions et la journée portent sur toutes les réservations, comme les
  // vues Jour/Liste du calendrier vers lesquelles elles renvoient.
  const resaAnnee = resaFenetre.filter((r) => r.villaId && logementIds.has(r.villaId));
  // Les compteurs « Ce qui a besoin de vous » restent limités à l'année en cours, comme avant
  // l'élargissement de la fenêtre.
  const resaToutes = resaFenetre.filter((r) => new Date(r.checkOut) >= debutAnnee);

  // --- Performance du mois ---------------------------------------------------------------------
  // Mêmes règles pour tous les mois : nuits et loyers au prorata, euros, dénominateur = nombre de
  // logements gérés aujourd'hui × jours du mois (aussi pour la référence N-1).
  function kpisDuMois(y: number, m: number) {
    const debut = new Date(y, m, 1);
    const fin = addMonths(debut, 1);
    let nuitees = 0;
    let ca = 0;
    let caCumul = 0;
    let nbReservations = 0;
    for (const r of resaAnnee) {
      const checkIn = new Date(r.checkIn);
      const checkOut = new Date(r.checkOut);
      const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
      nuitees += nuiteesDansLeMois(checkIn, checkOut, y, m);
      if (checkIn >= debut && checkIn < fin) nbReservations++;
      if (loyer > 0) {
        ca += versEuros(montantProrata(loyer, checkIn, checkOut, y, m), r.devisePaiement, madParEur);
        for (let k = 0; k <= m; k++) {
          caCumul += versEuros(montantProrata(loyer, checkIn, checkOut, y, k), r.devisePaiement, madParEur);
        }
      }
    }
    const nuitsDisponibles = logements.length * new Date(y, m + 1, 0).getDate();
    const taux = nuitsDisponibles > 0 ? (nuitees / nuitsDisponibles) * 100 : 0;
    return { nuitees, ca, caCumul, nbReservations, taux };
  }

  const moisCourant = kpisDuMois(year, monthIndex);
  const moisCourantN1 = kpisDuMois(year - 1, monthIndex);
  const dernier = kpisDuMois(moisDernier.getFullYear(), moisDernier.getMonth());
  const dernierN1 = kpisDuMois(moisDernier.getFullYear() - 1, moisDernier.getMonth());
  const libelleMois = (y: number, m: number) => format(new Date(y, m, 1), "MMM yyyy", { locale: fr });

  // --- Ce qui a besoin de vous -----------------------------------------------------------------
  const impayees = resaToutes.filter((r) => estImpayee(r, now));
  const cautions = resaToutes.filter((r) => cautionEnAttente(r, now));

  const arrivees = resaToutes.filter((r) => isSameDay(new Date(r.checkIn), now));

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
      <section className="space-y-2.5">
        <SectionHeader title="Performance du mois" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          <KpiTile
            icon={Gauge}
            label="Taux d'occupation"
            value={nombre1(moisCourant.taux)}
            unit="%"
            compare={comparerTaux(moisCourant.taux, moisCourantN1.taux, libelleMois(year - 1, monthIndex))}
          />
          <KpiTile
            icon={Wallet}
            label={`CA de ${format(now, "MMMM", { locale: fr })}`}
            value={euros.format(moisCourant.ca)}
            unit="€"
            compare={comparerMontant(moisCourant.ca, moisCourantN1.ca, libelleMois(year - 1, monthIndex))}
          />
          <KpiTile
            icon={HandCoins}
            label={`Depuis le 1ᵉʳ janvier ${year}`}
            value={euros.format(moisCourant.caCumul)}
            unit="€"
            compare={comparerMontant(
              moisCourant.caCumul,
              moisCourantN1.caCumul,
              monthIndex === 0
                ? libelleMois(year - 1, 0)
                : `${format(new Date(year - 1, 0, 1), "MMM", { locale: fr })}–${libelleMois(year - 1, monthIndex)}`
            )}
          />
          <KpiTile
            icon={CalendarDays}
            label="Réservations du mois"
            value={String(moisCourant.nbReservations)}
            compare={comparerNombre(moisCourant.nbReservations, moisCourantN1.nbReservations, libelleMois(year - 1, monthIndex))}
          />
        </div>
      </section>

      <section className="space-y-2.5">
        <SectionHeader title={`Mois dernier · ${format(moisDernier, "MMMM yyyy", { locale: fr })}`} />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          <KpiTile
            icon={Gauge}
            label="Taux d'occupation"
            value={nombre1(dernier.taux)}
            unit="%"
            compare={comparerTaux(dernier.taux, dernierN1.taux, libelleMois(moisDernier.getFullYear() - 1, moisDernier.getMonth()))}
          />
          <KpiTile
            icon={Wallet}
            label={`CA de ${format(moisDernier, "MMMM", { locale: fr })}`}
            value={euros.format(dernier.ca)}
            unit="€"
            compare={comparerMontant(dernier.ca, dernierN1.ca, libelleMois(moisDernier.getFullYear() - 1, moisDernier.getMonth()))}
          />
          <KpiTile
            icon={BedDouble}
            label="Nuitées vendues"
            value={euros.format(dernier.nuitees)}
            compare={comparerNombre(dernier.nuitees, dernierN1.nuitees, libelleMois(moisDernier.getFullYear() - 1, moisDernier.getMonth()))}
          />
          <KpiTile
            icon={CalendarDays}
            label="Réservations du mois"
            value={String(dernier.nbReservations)}
            compare={comparerNombre(dernier.nbReservations, dernierN1.nbReservations, libelleMois(moisDernier.getFullYear() - 1, moisDernier.getMonth()))}
          />
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

type Ecart = { texte: string; ton: "hausse" | "baisse" | "stable" };
type Comparaison = { label: string; value: string; delta: Ecart | null };

const nombre1 = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const signe = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

// Écart relatif en %, sans écart affiché quand la référence N-1 est à zéro (division impossible).
function ecartRelatif(actuel: number, precedent: number): Ecart | null {
  if (!(precedent > 0)) return null;
  const pct = Math.round(((actuel - precedent) / precedent) * 100);
  return { texte: `${signe(pct)}${Math.abs(pct)} %`, ton: pct > 0 ? "hausse" : pct < 0 ? "baisse" : "stable" };
}

function comparerMontant(actuel: number, precedent: number, label: string): Comparaison {
  return { label, value: `${euros.format(precedent)} €`, delta: ecartRelatif(actuel, precedent) };
}

function comparerNombre(actuel: number, precedent: number, label: string): Comparaison {
  return { label, value: euros.format(precedent), delta: ecartRelatif(actuel, precedent) };
}

// Taux d'occupation : l'écart est en points, pas en % relatif.
function comparerTaux(actuel: number, precedent: number, label: string): Comparaison {
  const ecart = Math.round((actuel - precedent) * 10) / 10;
  return {
    label,
    value: `${nombre1(precedent)} %`,
    delta:
      precedent > 0
        ? { texte: `${signe(ecart)}${nombre1(Math.abs(ecart))} pt`, ton: ecart > 0 ? "hausse" : ecart < 0 ? "baisse" : "stable" }
        : null,
  };
}

const TON_ECART: Record<Ecart["ton"], string> = {
  hausse: "text-emerald-600 dark:text-emerald-400",
  baisse: "text-red-600 dark:text-red-400",
  stable: "text-muted-foreground",
};

function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  compare,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  compare?: Comparaison;
}) {
  return (
    <div className="space-y-2 bg-card p-3 sm:p-4">
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
      {compare ? (
        <p className="text-xs leading-snug tabular-nums text-muted-foreground">
          {compare.delta ? <span className={`font-medium ${TON_ECART[compare.delta.ton]}`}>{compare.delta.texte} </span> : null}
          vs {compare.label} : {compare.value}
        </p>
      ) : null}
    </div>
  );
}
