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
// Refonte 2026-08-29 (identité visuelle) — Kamel, après avoir vu le lien public refait : "oui,
// même habillage que le lien public" pour cet onglet aussi (choix inverse de la fois d'avant, où
// il avait demandé de rester cohérent avec Affectations/Carte/Statistiques). Même langage que
// public-planning-grid.tsx : fond crème, cartes arrondies, avatars à initiale, puce calendrier —
// appliqué seulement à l'intérieur de cet onglet, pas à la page Personnel ni aux autres onglets
// qui gardent leur charte habituelle.
export function PersonnelPlanningGrid({ jours, now }: { jours: JourPlanning[]; now: Date }) {
  const [recherche, setRecherche] = useState("");
  const q = recherche.trim();

  return (
    <div className="space-y-4 rounded-[20px] bg-[#FBF7F1] p-3 dark:bg-[#17130f] sm:p-5">
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
            className="w-full rounded-full border border-black/[0.06] bg-white py-1.5 pl-8 pr-7 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground focus:border-[#2B1F33]/40 dark:border-white/[0.06] dark:bg-white/[0.04]"
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {jours.map(({ date, entries }) => {
          const estAujourdhui = isSameDay(date, now);
          const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
          return (
            <div
              key={date.toISOString()}
              className={cn(
                "min-w-0 rounded-[18px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]",
                estAujourdhui
                  ? "bg-gradient-to-br from-[#2B1F33]/[0.06] to-transparent ring-1 ring-[#2B1F33]/15 dark:from-[#C0AECB]/10 dark:ring-[#C0AECB]/20"
                  : "bg-white ring-1 ring-black/[0.04] dark:bg-white/[0.03] dark:ring-white/[0.06]"
              )}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-[12px] leading-none text-white",
                    estAujourdhui ? "bg-[#2B1F33]" : "bg-[#DCD3C3] text-[#2B1F33] dark:bg-white/10 dark:text-white/80"
                  )}
                >
                  <span className="text-[8px] font-semibold uppercase opacity-80">{format(date, "MMM", { locale: fr })}</span>
                  <span className="text-sm font-bold">{format(date, "d")}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold capitalize">{format(date, "EEE", { locale: fr })}</p>
                  {estAujourdhui ? <p className="text-[10px] font-medium text-[#2B1F33] dark:text-[#C0AECB]">Aujourd&apos;hui</p> : null}
                </div>
              </div>

              <div className="space-y-1.5">
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

function detailLabel(e: PlanningEntry): string {
  if (e.role === "cuisine") return e.avecDejeuner ? "Petit-déj + déj" : "Petit-déj seul";
  return e.moment === "sejour" ? "Pendant le séjour" : "Ménage de départ";
}

function initiale(nom: string): string {
  return nom.trim().charAt(0).toUpperCase() || "?";
}

function MissionBlock({ entry: e }: { entry: PlanningEntry }) {
  return (
    <div className="flex min-w-0 gap-2 rounded-[14px] bg-black/[0.025] p-2 dark:bg-white/[0.04]">
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
            e.role === "menage"
              ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
              : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          )}
        >
          {initiale(e.personnelNom)}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-white dark:ring-[#1e1e1e]",
            e.role === "menage" ? "bg-orange-500" : "bg-violet-500"
          )}
        >
          {e.role === "menage" ? "M" : "C"}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-xs font-semibold">{e.personnelNom}</span>
          <PlanningRemoveButton affectationId={e.affectationId} nom={e.personnelNom} />
        </div>
        <Link href={`/reservations/${e.reservationId}`} className="block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName}
        </Link>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground dark:bg-white/10">{detailLabel(e)}</span>
          {!e.montantVisible ? (
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground dark:bg-white/10">Payé par proprio</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
