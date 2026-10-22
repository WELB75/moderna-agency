"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Même rendu que FichePoliceStatusChip / ContratStatusChip : ouvre la « Déclaration sur
// l'honneur » pour le syndic de la résidence (appartements Noria uniquement). Prête dès que la
// fiche police du séjour est remplie — c'est elle qui fournit les noms et numéros de pièce.
export function DeclarationSyndicChip({
  reservationId,
  ficheStatut,
}: {
  reservationId: string;
  ficheStatut: "complete" | "en_attente" | null;
}) {
  const done = ficheStatut === "complete";
  return (
    <Link
      href={`/declaration-syndic/${reservationId}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        done
          ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 dark:border-emerald-500/20"
          : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/20"
      )}
    >
      <Building2 className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Syndic · </span>
        <span className="font-medium text-foreground">{done ? "Prête" : "Après fiche police"}</span>
      </span>
    </Link>
  );
}
