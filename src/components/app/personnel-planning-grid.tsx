"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
// Refonte 2026-08-28 (clarté, reste dans la charte de l'app — voir les autres onglets de cette
// même page) : recherche étendue à la villa/l'appart et au client (avant : uniquement le prénom,
// avec une simple sous-chaine sensible aux accents) via matchesSearch, déjà utilisé partout
// ailleurs dans l'app. Colonnes progressives (1 → 2 → 4 → 7) au lieu d'un saut brutal 1→7 col dès
// 768px, qui écrasait chaque jour sur un écran de laptop/tablette. Détail de mission éclaté en
// petites étiquettes (rôle, repas, "payé par proprio") au lieu d'une phrase muette qui s'allonge,
// et cible de retrait agrandie pour rester utilisable au doigt.
export function PersonnelPlanningGrid({ jours, now }: { jours: JourPlanning[]; now: Date }) {
  const [recherche, setRecherche] = useState("");
  const q = recherche.trim();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
            Femme de ménage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
            Cuisinière
          </span>
        </div>

        <div className="relative w-full max-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher (nom, villa, appart...)"
            className="w-full border border-border bg-background py-1.5 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
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

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {jours.map(({ date, entries }) => {
          const estAujourdhui = isSameDay(date, now);
          const filtrees = q ? entries.filter((e) => entreeCorrespond(e, q)) : entries;
          return (
            <Card key={date.toISOString()} className={cn(estAujourdhui && "bg-muted/30 ring-1 ring-foreground/15")}>
              <CardHeader className="pb-1.5">
                <CardTitle className="flex items-center gap-1.5 text-sm font-medium capitalize">
                  {format(date, "EEE d MMM", { locale: fr })}
                  {estAujourdhui ? <Badge>Aujourd&apos;hui</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {filtrees.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{q ? "Aucun résultat." : "Rien de prévu."}</p>
                ) : (
                  filtrees.map((e) => <MissionBlock key={e.affectationId} entry={e} />)
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
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

function MissionBlock({ entry: e }: { entry: PlanningEntry }) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-md border-l-4 bg-muted/40 py-1.5 pl-2 pr-1 text-xs",
        e.role === "menage" ? "border-l-orange-500" : "border-l-violet-500"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">{e.personnelNom}</span>
        <PlanningRemoveButton affectationId={e.affectationId} nom={e.personnelNom} />
      </div>
      <Link href={`/reservations/${e.reservationId}`} className="block truncate text-muted-foreground hover:text-foreground hover:underline">
        {e.villaNom ? `${e.villaNom} (n°${e.villaNumero})` : "Villa non renseignée"} · {e.guestName}
      </Link>
      <div className="flex flex-wrap items-center gap-1 pt-0.5">
        <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{detailLabel(e)}</span>
        {!e.montantVisible ? (
          <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Payé par proprio</span>
        ) : null}
      </div>
    </div>
  );
}
