"use client";

import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DomainePlanModernaII, type PlanVilla } from "@/components/app/domaine-plan-moderna-ii";

// Icône compacte à la place du gros bloc "Voir le plan du domaine" qui prenait toute une ligne —
// Kamel, 2026-08-17 : "quelque chose de ludique, intelligent" plutôt qu'un pavé permanent. Le
// plan (avec son propre titre) s'affiche dans une fenêtre au clic.
export function DomainePlanTrigger({ villas }: { villas: PlanVilla[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" title="Voir le plan du domaine" aria-label="Voir le plan du domaine">
          <Map className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="sr-only">Plan du domaine</DialogTitle>
        <DomainePlanModernaII villas={villas} />
      </DialogContent>
    </Dialog>
  );
}
