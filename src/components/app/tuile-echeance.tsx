"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileCheck2, FileSignature, FileText, FileWarning, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowInMorocco, formatUtcDayMonthTime } from "@/lib/now";
import { calculerEcheance, echeanceDocuments } from "@/lib/echeance-documents";

// Tuile « Prochaines échéances » (accueil) : compte à rebours permanent jusqu'à la limite J-1
// d'une arrivée, qui tourne à la seconde (Fouad, 2026-10-31 : « un vrai compteur »). Client pour
// le tic ; suppressHydrationWarning parce que la seconde diffère entre serveur et navigateur.
//
// Lecture : nom de la villa et du voyageur, « 5 j 14 h 03 min » (ou « 03:12:45 » sous 24 h, pour
// qu'on voie le temps filer), puis l'état de chaque document : fiche police (avec « 2/4
// passeports » quand une partie du groupe s'est déjà enregistrée) et contrat.

const TONE = {
  neutre: "border-border bg-card",
  attente: "border-amber-500/40 bg-amber-500/5",
  urgent: "border-red-500/40 bg-red-500/5",
  ok: "border-emerald-500/40 bg-emerald-500/5",
} as const;

const TEXTE = {
  neutre: "text-foreground",
  attente: "text-amber-700 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
  ok: "text-emerald-700 dark:text-emerald-400",
} as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// « 5 j 14 h » au-delà d'un jour, « 14 h 03 min » au-delà d'une heure, « 03:12:45 » en dessous
// de 24 h pour la limite (le chrono visible), toujours en valeur absolue : le signe est porté par
// le libellé (« restant » / « de retard »).
function chrono(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const j = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (j > 0) return `${j} j ${h} h ${pad(m)} min`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function TuileEcheance({
  reservationId,
  villaNom,
  guestName,
  checkIn,
  ficheStatut,
  contratStatut,
  progressionFiche,
  ficheId,
}: {
  reservationId: string;
  villaNom: string;
  guestName: string;
  checkIn: Date;
  ficheStatut: "complete" | "en_attente" | null;
  contratStatut: "signe" | "en_attente" | null;
  progressionFiche: string | null;
  ficheId: string | null;
}) {
  const [now, setNow] = useState(() => nowInMorocco());
  useEffect(() => {
    const interval = setInterval(() => setNow(nowInMorocco()), 1000);
    return () => clearInterval(interval);
  }, []);

  const e = calculerEcheance({ checkIn, ficheStatut, contratStatut }, now);
  const limite = echeanceDocuments(checkIn);
  const reste = limite.getTime() - now.getTime();

  let titreChrono: string;
  let valeurChrono: string;
  if (e.etat === "ok") {
    titreChrono = "Documents prêts";
    valeurChrono = "✓";
  } else if (e.etat === "arrive") {
    titreChrono = "Arrivé sans papiers depuis";
    valeurChrono = chrono(now.getTime() - checkIn.getTime());
  } else if (e.etat === "retard") {
    titreChrono = "Limite J-1 dépassée depuis";
    valeurChrono = chrono(reste);
  } else {
    titreChrono = "Avant la limite J-1";
    valeurChrono = chrono(reste);
  }

  const ficheOk = ficheStatut === "complete";
  const contratOk = contratStatut === "signe";

  return (
    <Link
      href={`/reservations/${reservationId}`}
      className={cn(
        "flex w-[15rem] shrink-0 snap-start flex-col gap-2 rounded-2xl border p-3 transition-colors hover:border-primary/50 sm:w-auto",
        TONE[e.tone]
      )}
      title={e.detail}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{villaNom}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {guestName} · arrivée {formatUtcDayMonthTime(checkIn)}
        </span>
      </span>

      <span className="flex items-center gap-2">
        <Timer className={cn("h-4 w-4 shrink-0", TEXTE[e.tone])} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[11px] leading-tight text-muted-foreground">{titreChrono}</span>
          <span className={cn("block text-xl font-semibold leading-tight tabular-nums", TEXTE[e.tone])} suppressHydrationWarning>
            {valeurChrono}
          </span>
        </span>
      </span>

      <span className="flex flex-col gap-0.5 text-xs">
        <Etat ok={ficheOk} icon={ficheOk ? FileCheck2 : FileText} urgent={e.tone === "urgent"}>
          {ficheOk ? "Fiche police faite" : progressionFiche ? `Fiche police ${progressionFiche}` : ficheId ? "Fiche police en attente" : "Fiche police pas encore créée"}
        </Etat>
        <Etat ok={contratOk} icon={contratOk ? FileCheck2 : contratStatut ? FileSignature : FileWarning} urgent={e.tone === "urgent"}>
          {contratOk ? "Contrat signé" : contratStatut ? "Contrat à signer" : "Contrat pas encore généré"}
        </Etat>
      </span>
    </Link>
  );
}

function Etat({
  ok,
  urgent,
  icon: Icon,
  children,
}: {
  ok: boolean;
  urgent: boolean;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        ok ? "text-emerald-700 dark:text-emerald-400" : urgent ? "font-medium text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
