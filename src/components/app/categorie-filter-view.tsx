"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategorieIcon } from "@/components/app/categorie-icon";
import { categorieLabel, type Categorie } from "@/lib/intervention-categorie";

export type CategorieGroup = {
  categorie: Categorie;
  count: number;
  content: ReactNode;
};

// Vue "catégories d'abord" : au premier coup d'œil on ne voit que les tuiles de
// catégorie (icône sobre + titre + nombre restant), et on clique dessus pour
// tomber sur le détail des constats/travaux de cette catégorie.
export function CategorieFilterView({ groups }: { groups: CategorieGroup[] }) {
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
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => (
        <button
          key={g.categorie}
          type="button"
          onClick={() => setSelected(g.categorie)}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <CategorieIcon categorie={g.categorie} className="h-4 w-4 text-muted-foreground" />
          <span>{categorieLabel(g.categorie)}</span>
          {g.count > 0 ? <span className="ml-0.5 text-muted-foreground">{g.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
