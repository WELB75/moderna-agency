"use client";

import { useTransition } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { togglePersonnelEnquete } from "@/lib/actions/personnel";
import { cn } from "@/lib/utils";

// Drapeau discret, pas de texte écrit nulle part dans l'app — Kamel, 2026-08-06 : "donne pas
// d'infos écrite ! juste ENQUETE à côté de son prénom c'est tout en orange". Cliquable pour
// activer/désactiver ; invisible (juste une petite icône neutre) quand ce n'est pas activé.
export function PersonnelEnqueteBadge({ personnelId, enquete }: { personnelId: string; enquete: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        await togglePersonnelEnquete(personnelId, !enquete);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  if (enquete) {
    return (
      <button type="button" onClick={toggle} disabled={isPending}>
        <Badge className="cursor-pointer border-orange-500/40 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 dark:text-orange-400">
          ENQUÊTE
        </Badge>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={cn("text-muted-foreground/30 hover:text-orange-500", isPending && "opacity-50")}
      aria-label="Marquer en enquête"
      title="Marquer en enquête"
    >
      <Flag className="h-3.5 w-3.5" />
    </button>
  );
}
