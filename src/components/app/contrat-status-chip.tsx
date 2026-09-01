"use client";

import Link from "next/link";
import { FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";

// Même rendu que StatusChip, mais cliquable — Kamel, 2026-09-01 : "quand on clic sur contrat y a
// rien qu'il se passe, je veux ouvrir aussi la fiche contrat". Un contrat déjà généré ouvre sa
// page de suivi ; sans contrat, direction la page où on le génère, villa et réservation déjà
// pré-remplies (voir defaultVillaId/defaultReservationId sur GenerateContratForm).
export function ContratStatusChip({
  contratId,
  contratStatut,
  villaId,
  reservationId,
}: {
  contratId: string | null;
  contratStatut: "signe" | "en_attente" | null;
  villaId: string | null;
  reservationId: string;
}) {
  const done = contratStatut === "signe";
  const value = contratStatut === "signe" ? "Signé" : contratStatut === "en_attente" ? "En attente" : "Manquant";

  const href = contratId
    ? `/contrats/${contratId}`
    : `/documents?onglet=contrat${villaId ? `&villaId=${villaId}` : ""}&reservationId=${reservationId}`;

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        done
          ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 dark:border-emerald-500/20"
          : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/20"
      )}
    >
      <FileSignature className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Contrat · </span>
        <span className="font-medium text-foreground">{value}</span>
      </span>
    </Link>
  );
}
