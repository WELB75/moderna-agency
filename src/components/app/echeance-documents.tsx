"use client";

import { useEffect, useState } from "react";
import { FileClock, FileCheck2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowInMorocco } from "@/lib/now";
import { calculerEcheance, type Echeance } from "@/lib/echeance-documents";

// Compte à rebours « fiche police + contrat à régler 24 h avant l'arrivée » (voir
// lib/echeance-documents.ts). Client pour que le temps restant avance tout seul sans recharger
// la page (même mécanique que Countdown : tic toutes les 30 s, suppressHydrationWarning parce
// que la seconde de rendu diffère entre serveur et navigateur).
//
// Deux présentations :
// - "ligne" : texte compact dans la ligne de résumé d'une carte d'agenda ("Fiche police + contrat
//   · 9 h restantes").
// - "pastille" : badge arrondi avec icône, pour le suivi des arrivées.
export function EcheanceDocuments({
  checkIn,
  ficheStatut,
  contratStatut,
  variant = "ligne",
  className,
}: {
  checkIn: Date;
  ficheStatut: "complete" | "en_attente" | null;
  contratStatut: "signe" | "en_attente" | null;
  variant?: "ligne" | "pastille";
  className?: string;
}) {
  const [now, setNow] = useState(() => nowInMorocco());
  useEffect(() => {
    const interval = setInterval(() => setNow(nowInMorocco()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const e = calculerEcheance({ checkIn, ficheStatut, contratStatut }, now);

  if (variant === "pastille") {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
          e.tone === "ok" && "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
          e.tone === "attente" && "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
          e.tone === "urgent" && "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
          e.tone === "neutre" && "border-border bg-muted/40 text-foreground",
          className
        )}
        title={e.detail}
        suppressHydrationWarning
      >
        {icone(e, "h-3.5 w-3.5 shrink-0")}
        <span className="truncate" suppressHydrationWarning>
          {e.manquants.length > 0 ? `${e.manquants.join(" + ")} · ` : ""}
          {e.label}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1",
        e.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
        e.tone === "attente" && "text-amber-700 dark:text-amber-400",
        e.tone === "urgent" && "font-medium text-red-600 dark:text-red-400",
        e.tone === "neutre" && "text-muted-foreground",
        className
      )}
      title={e.detail}
      suppressHydrationWarning
    >
      {icone(e, "h-3 w-3 shrink-0")}
      <span className="truncate" suppressHydrationWarning>
        {e.manquants.length > 0 ? `${e.manquants.join(" + ")} · ` : ""}
        {e.label}
      </span>
    </span>
  );
}

function icone(e: Echeance, className: string) {
  if (e.etat === "ok") return <FileCheck2 className={className} />;
  if (e.tone === "urgent") return <FileWarning className={className} />;
  return <FileClock className={className} />;
}
