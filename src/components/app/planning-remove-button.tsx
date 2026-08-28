"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { removePersonnelAffectation } from "@/lib/actions/personnel";

// Retrait rapide directement depuis la grille du planning — pour affecter un remplaçant, ouvrir
// la fiche réservation (lien sur chaque entrée) où l'éditeur complet (PersonnelAffectationEditor)
// reste disponible.
export function PlanningRemoveButton({ affectationId, nom }: { affectationId: string; nom: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await removePersonnelAffectation(affectationId);
        toast.success(`${nom} retirée du planning.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={`Retirer ${nom}`}
      title="Retirer"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
