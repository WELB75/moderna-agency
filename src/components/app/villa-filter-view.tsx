"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VillaGroup = {
  villaId: string;
  label: string;
  count: number;
  content: ReactNode;
};

// Vue "villa d'abord" : au premier coup d'œil on voit dans quelle villa se
// situent les tâches en attente (nom + nombre), et on clique dessus pour
// tomber sur le détail de cette villa.
export function VillaFilterView({ groups }: { groups: VillaGroup[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const activeGroup = groups.find((g) => g.villaId === selected);
  if (activeGroup) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Toutes les villas
        </Button>
        {activeGroup.content}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {groups.map((g) => (
        <button
          key={g.villaId}
          type="button"
          onClick={() => setSelected(g.villaId)}
          className="flex flex-col items-center gap-1.5 rounded-md border px-3 py-4 text-center transition-colors hover:bg-accent"
        >
          <Building2 className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">{g.label}</span>
          <span className="text-xs text-muted-foreground">
            {g.count} tâche{g.count > 1 ? "s" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
