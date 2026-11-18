"use client";

import { useTransition } from "react";
import { Check, RotateCcw, X, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changerStatutDemandeService } from "@/lib/actions/services-voyageur";

type Statut = "demandee" | "confirmee" | "refusee" | "terminee";

export function DemandeServiceActions({ id, statut }: { id: string; statut: Statut }) {
  const [enCours, startTransition] = useTransition();
  function changer(s: Statut) {
    startTransition(async () => {
      try {
        await changerStatutDemandeService(id, s);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {statut === "demandee" ? (
        <>
          <Button size="sm" className="h-9" disabled={enCours} onClick={() => changer("confirmee")}>
            <Check className="h-3.5 w-3.5" />
            Confirmer
          </Button>
          <Button size="sm" variant="outline" className="h-9" disabled={enCours} onClick={() => changer("refusee")}>
            <X className="h-3.5 w-3.5" />
            Indisponible
          </Button>
        </>
      ) : null}
      {statut === "confirmee" ? (
        <Button size="sm" variant="outline" className="h-9" disabled={enCours} onClick={() => changer("terminee")}>
          <CircleCheck className="h-3.5 w-3.5" />
          Terminé
        </Button>
      ) : null}
      {statut !== "demandee" ? (
        <Button size="sm" variant="ghost" className="h-9" disabled={enCours} onClick={() => changer("demandee")}>
          <RotateCcw className="h-3.5 w-3.5" />
          Remettre en attente
        </Button>
      ) : null}
    </div>
  );
}
