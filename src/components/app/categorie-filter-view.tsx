"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategorieIcon } from "@/components/app/categorie-icon";
import { categorieLabel, type Categorie } from "@/lib/intervention-categorie";
import type { CategorieStats } from "@/lib/categorie-stats";

export type CategorieGroup = {
  categorie: Categorie;
  count: number;
  content: ReactNode;
};

// Vue "catégories d'abord" : au premier coup d'œil on ne voit que les tuiles de
// catégorie (icône sobre + titre + nombre restant), et on clique dessus pour
// tomber sur le détail des constats/travaux de cette catégorie.
export function CategorieFilterView({ groups, stats }: { groups: CategorieGroup[]; stats?: CategorieStats }) {
  const [selected, setSelected] = useState<Categorie | null>(null);

  if (groups.length === 0) return null;

  const activeGroup = groups.find((g) => g.categorie === selected);
  if (activeGroup) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Toutes les catégories
        </Button>
        {activeGroup.content}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="À traiter" value={stats.aTraiter} />
          <StatChip label="En cours" value={stats.enCours} />
          <StatChip label="Terminées" value={stats.terminees} />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {groups.map((g) => (
          <button
            key={g.categorie}
            type="button"
            onClick={() => setSelected(g.categorie)}
            className="flex flex-col items-center gap-1.5 rounded-md border px-3 py-4 text-center transition-colors hover:bg-accent"
          >
            <CategorieIcon categorie={g.categorie} className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">{categorieLabel(g.categorie)}</span>
            {g.count > 0 ? (
              <span className="text-xs text-muted-foreground">
                ({g.count} tâche{g.count > 1 ? "s" : ""})
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
