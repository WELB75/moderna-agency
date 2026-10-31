"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LigneEcheance, type LigneEcheanceProps } from "@/components/app/ligne-echeance";

// Bloc « Prochaines échéances » : sur PC les N premières lignes puis « Voir les 2 suivantes »
// (le bloc doit rester de la hauteur des tuiles Arrivées / Départs / Sur place, pas quatre rangées
// de cartes — Fouad, 2026-10-31) ; sur téléphone toutes les bulles dans la bande qui défile au
// doigt, les retards en tête donc visibles sans balayer.

const VISIBLES_PC = 5;

export function ListeEcheances({ lignes }: { lignes: LigneEcheanceProps[] }) {
  const [tout, setTout] = useState(false);
  const cachees = lignes.slice(VISIBLES_PC);

  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:block sm:overflow-visible sm:rounded-2xl sm:border sm:bg-card sm:px-0 sm:pb-0">
      {lignes.map((l, i) => (
        <LigneEcheance key={l.reservationId} {...l} masqueePc={!tout && i >= VISIBLES_PC} />
      ))}
      {cachees.length > 0 && (
        <button
          type="button"
          onClick={() => setTout((t) => !t)}
          className="hidden w-full items-center justify-center gap-1 border-t py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          {tout ? "Réduire" : `Voir ${cachees.length === 1 ? "la suivante" : `les ${cachees.length} suivantes`} (${cachees.map((c) => c.villaNom).join(", ")})`}
          <ChevronDown className={tout ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} aria-hidden />
        </button>
      )}
    </div>
  );
}
