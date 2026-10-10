import Link from "next/link";
import { CalendarDays, GanttChartSquare, List } from "lucide-react";
import { getTarification } from "@/lib/pricelabs/sync";
import { TarificationView } from "@/components/app/tarification-view";
import { CalendrierJour, type OngletJour } from "@/components/app/calendrier-jour";
import { CalendrierListe, type FiltreListe } from "@/components/app/calendrier-liste";
import { nowInMorocco } from "@/lib/now";
import { cn } from "@/lib/utils";

type Vue = "jour" | "planning" | "liste";

const VUES: { key: Vue; label: string; icon: typeof CalendarDays }[] = [
  { key: "jour", label: "Vue jour", icon: CalendarDays },
  { key: "planning", label: "Vue planning", icon: GanttChartSquare },
  { key: "liste", label: "Vue liste", icon: List },
];

const ONGLETS_JOUR: OngletJour[] = ["tout", "departs", "arrivees", "sur-place"];
const FILTRES_LISTE: FiltreListe[] = ["a-venir", "en-cours", "passees", "impayees", "cautions"];

// "2026-10-09" → Date à minuit, dans la même convention que le reste de l'app (heure marocaine
// stockée telle quelle en UTC, voir lib/now.ts). Date invalide → null (on retombe sur aujourd'hui).
function parseDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Calendrier à plusieurs vues, sur le modèle de SuperHote v2 :
// - Vue jour : départs/arrivées/ménages du jour, bandeau des 7 jours (nouveau).
// - Vue planning : la grille villas × jours avec prix PriceLabs et réservations (l'ancienne page
//   Calendrier, inchangée).
// - Vue liste : tableau des réservations avec filtres (à venir, en cours, impayées, cautions…).
export default async function CalendrierPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; date?: string; onglet?: string; filtre?: string }>;
}) {
  const params = await searchParams;
  const vue: Vue = VUES.some((v) => v.key === params.vue) ? (params.vue as Vue) : "jour";
  const now = nowInMorocco();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendrier</h1>
          <p className="text-sm text-muted-foreground">
            {vue === "planning"
              ? "Prix et réservations en direct de chaque villa, synchronisés depuis PriceLabs."
              : vue === "liste"
                ? "Toutes les réservations, avec leur statut de paiement."
                : "Départs, arrivées et ménages à organiser, jour par jour."}
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1" aria-label="Vues du calendrier">
          {VUES.map((v) => {
            const Icon = v.icon;
            return (
              <Link
                key={v.key}
                href={`/calendrier?vue=${v.key}`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  vue === v.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {vue === "jour" ? (
        <CalendrierJour
          now={now}
          date={parseDateParam(params.date) ?? now}
          onglet={ONGLETS_JOUR.includes(params.onglet as OngletJour) ? (params.onglet as OngletJour) : "tout"}
        />
      ) : vue === "liste" ? (
        <CalendrierListe
          now={now}
          filtre={FILTRES_LISTE.includes(params.filtre as FiltreListe) ? (params.filtre as FiltreListe) : "a-venir"}
        />
      ) : (
        // Rendu initial avec le cache déjà en base (pas d'appel PriceLabs bloquant au chargement
        // de la page) — le bouton "Actualiser les prix" côté client force une resynchro.
        <TarificationView initialVillas={await getTarification()} />
      )}
    </div>
  );
}
