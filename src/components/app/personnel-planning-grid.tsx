"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, X } from "lucide-react";
import { PlanningRemoveButton } from "@/components/app/planning-remove-button";
import { matchesSearch } from "@/lib/text-match";
import { cn } from "@/lib/utils";

export type PlanningEntry = {
  affectationId: string;
  reservationId: string;
  villaNom: string | null;
  villaNumero: string | null;
  guestName: string;
  role: "menage" | "cuisine";
  moment: "sejour" | "depart" | "unique";
  personnelNom: string;
  avecDejeuner: boolean;
  montantVisible: boolean;
};

type JourPlanning = { date: Date; entries: PlanningEntry[] };

// Recherche par prénom directement dans la grille — Kamel, 2026-08-07 : "je tape un prénom on le
// trouve direct dans le planning". Filtre côté client (les 7 jours sont déjà chargés), pas de
// rechargement de page : on tape, seules les entrées qui matchent restent affichées.
//
// Refonte 2026-08-28 (clarté) : recherche étendue à la villa/l'appart et au client via
// matchesSearch, colonnes progressives (1 → 2 → 4 → 7) au lieu d'un saut brutal à 768px, détail
// de mission éclaté en petites étiquettes, cible de retrait agrandie.
//
// Refonte 2026-09-08 (façon Stripe) — Kamel : "le planning aussi faut revoir le design en mode
// stripe stp, écriture plus fine, plus de logique etc". Remplace l'identité "fond crème" du
// 2026-08-29 (calquée sur le lien public) par la même charte plate que le reste de l'app —
// cartes blanches à bordure fine, texte en poids normal/medium plutôt que gras partout, plus une
// seule couleur maison inventée (#2B1F33). La logique de recherche/tri/priorité d'affichage
// (2026-08-30 : nom d'abord, puis rôle, puis villa jamais tronquée) ne change pas, seul
// l'habillage visuel est revu.
export function PersonnelPlanningGrid({ jours, now }: { jours: JourPlanning[]; now: Date }) {
  const [recherche, setRecherche] = useState("");
  const q = recherche.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="orange">Femme de ménage</LegendChip>
          <LegendChip color="violet">Cuisinière</LegendChip>
        </div>

        <div className="relative w-full max-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher (nom, villa, appart...)"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50"
          />
          {recherche ? (
            <button
              type="button"
              onClick={() => setRecherche("")}
              aria-label="Effacer"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {jours.map(({ date, entries }) => {
          const estAujourdhui = isSameDay(date, now);
          const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "min-w-0 rounded-2xl border bg-card p-3 shadow-[0_2px_8px_rgba(50,50,93,0.08)]",
                estAujourdhui ? "border-primary/30 bg-primary/5" : "border-border"
              )}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none",
                    estAujourdhui ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-foreground"
                  )}
                >
                  <span className="text-[9px] font-medium uppercase opacity-70">{format(date, "MMM", { locale: fr })}</span>
                  <span className="text-base font-semibold">{format(date, "d")}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize">{format(date, "EEEE", { locale: fr })}</p>
                  {estAujourdhui ? (
                    <p className="text-xs font-medium text-primary">Aujourd&apos;hui</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{filtrees.length} mission{filtrees.length > 1 ? "s" : ""}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {filtrees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{q ? "Aucun résultat." : "Rien de prévu."}</p>
                ) : (
                  filtrees.map((e) => <MissionBlock key={e.affectationId} entry={e} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendChip({ color, children }: { color: "orange" | "violet"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        color === "orange" ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", color === "orange" ? "bg-orange-500" : "bg-violet-500")} />
      {children}
    </span>
  );
}

function entreeCorrespond(e: PlanningEntry, q: string): boolean {
  const haystack = [e.personnelNom, e.villaNom ?? "", e.villaNumero ?? "", e.guestName].join(" ");
  return matchesSearch(haystack, q);
}

// Badge principal : le TYPE de mission ("Ménage de départ", "Pendant le séjour", "Cuisine") — la
// formule de repas de la cuisine (P-déj seul / + déj) passe en badge secondaire, voir
// formuleRepasLabel, pour ne pas perdre l'info tout en gardant "Cuisine" comme les libellés
// ménage. Kamel, 2026-08-30 : "cuisine au lieu de petit dej + dej".
function detailLabel(e: PlanningEntry): string {
  if (e.role === "cuisine") return "Cuisine";
  return e.moment === "sejour" ? "Pendant le séjour" : "Ménage de départ";
}

function formuleRepasLabel(e: PlanningEntry): string | null {
  if (e.role !== "cuisine") return null;
  return e.avecDejeuner ? "Petit-déj + déj" : "Petit-déj seul";
}

function initiale(nom: string): string {
  return nom.trim().charAt(0).toUpperCase() || "?";
}

function MissionBlock({ entry: e }: { entry: PlanningEntry }) {
  const roleClair = e.role === "menage" ? "orange" : "violet";
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border-l-[3px] bg-muted/40 p-2.5",
        roleClair === "orange" ? "border-l-orange-500" : "border-l-violet-500"
      )}
    >
      {/* Ordre voulu par Kamel : le nom d'abord (le plus visible), puis ce que fait la personne
          en vrai badge coloré, puis la villa avec son numéro toujours entier — jamais de
          troncature sur ces deux informations, c'est ce qu'il cherche en premier sur le terrain. */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
              roleClair === "orange"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
            )}
          >
            {initiale(e.personnelNom)}
          </div>
          <span className="min-w-0 truncate text-sm font-medium leading-tight">{e.personnelNom}</span>
        </div>
        <PlanningRemoveButton affectationId={e.affectationId} nom={e.personnelNom} />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            roleClair === "orange"
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
              : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
          )}
        >
          {detailLabel(e)}
        </span>
        {formuleRepasLabel(e) ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {formuleRepasLabel(e)}
          </span>
        ) : null}
        {!e.montantVisible ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Payé par proprio
          </span>
        ) : null}
      </div>

      <Link
        href={`/reservations/${e.reservationId}`}
        className="mt-1.5 flex min-w-0 items-baseline gap-1.5 text-sm text-foreground/80 hover:text-foreground hover:underline"
      >
        <span className="min-w-0 truncate">{e.villaNom ?? "Villa non renseignée"}</span>
        {e.villaNumero ? (
          <span className="shrink-0 rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">
            n°{e.villaNumero}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-muted-foreground">· {e.guestName}</span>
      </Link>
    </div>
  );
}
