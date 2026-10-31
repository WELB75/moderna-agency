"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { nowInMorocco, formatUtcDayMonthTime } from "@/lib/now";
import { calculerEcheance, dureeCourte, echeanceDocuments } from "@/lib/echeance-documents";

// Ligne « Prochaines échéances » (accueil). Fouad, 2026-10-31 : les premières tuiles (une carte
// par arrivée, gros chiffre, fond rouge entier) faisaient « des gros blocs » sur PC et des bulles
// trop grosses sur téléphone — mais il tient au compteur : « j'aime beaucoup, ça met la pression ».
//
// D'où ce compromis, un seul composant pour les deux écrans :
// - sur PC (sm+) une ligne de ~46 px dans un bloc unique : liseré de type, point d'état, villa et
//   voyageur, badges fiche police / contrat, délai aligné à droite ;
// - sur téléphone une petite bulle de ~10 rem de large (deux visibles), même contenu condensé,
//   dans la bande qui défile au doigt (echeances-arrivees.tsx).
// - le chrono ne tourne à la seconde que là où la pression sert : retard, voyageur arrivé sans
//   papiers, ou limite J-1 dans moins de 24 h (SEUIL_CHRONO_MS). Au-delà, un simple « 4 j ».
// - le rouge ne remplit plus la carte : seulement le point et le délai.
// - liseré gauche = type de logement (bordeaux = villa, vert d'eau = appartement), indépendant de
//   l'urgence pour ne jamais se battre avec le rouge (Fouad : « un petit code couleur pour les
//   villas et les appartements »).
//
// Client pour le tic ; suppressHydrationWarning parce que la seconde diffère entre serveur et navigateur.

export const SEUIL_CHRONO_MS = 24 * 60 * 60 * 1000;

const LISERE = {
  villa: "border-l-primary",
  appartement: "border-l-teal-500/80",
  inconnu: "border-l-border",
} as const;

const TEXTE = {
  neutre: "text-muted-foreground",
  attente: "font-semibold text-amber-700 dark:text-amber-400",
  urgent: "font-semibold text-red-600 dark:text-red-400",
  ok: "text-emerald-700 dark:text-emerald-400",
} as const;

const POINT = {
  neutre: "bg-muted-foreground/40",
  attente: "bg-amber-500 ring-[3px] ring-amber-500/20",
  urgent: "bg-red-500 ring-[3px] ring-red-500/20",
  ok: "bg-emerald-500",
} as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Chrono à la seconde : « 03:12:45 », ou « 1 j 19:46:00 » au-delà d'un jour (le cas « J-1 dans
// moins de 24 h » n'y arrive pas, mais un retard peut durer plus d'un jour).
function chrono(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const j = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return j > 0 ? `${j} j ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export type LigneEcheanceProps = {
  reservationId: string;
  villaNom: string;
  villaType: "villa" | "appartement" | null;
  guestName: string;
  checkIn: Date;
  ficheStatut: "complete" | "en_attente" | null;
  contratStatut: "signe" | "en_attente" | null;
  progressionFiche: string | null;
  ficheId: string | null;
};

export function LigneEcheance({
  reservationId,
  villaNom,
  villaType,
  guestName,
  checkIn,
  ficheStatut,
  contratStatut,
  progressionFiche,
  ficheId,
  masqueePc = false,
}: LigneEcheanceProps & { masqueePc?: boolean }) {
  const [now, setNow] = useState(() => nowInMorocco());
  const limite = echeanceDocuments(checkIn);
  const reste = limite.getTime() - now.getTime();
  const e = calculerEcheance({ checkIn, ficheStatut, contratStatut }, now);
  const enDirect = e.tone === "urgent" || reste <= SEUIL_CHRONO_MS;

  // Tic à la seconde seulement quand le chrono est visible, sinon à la minute (Vercel Hobby :
  // on garde le navigateur tranquille).
  useEffect(() => {
    const interval = setInterval(() => setNow(nowInMorocco()), enDirect ? 1000 : 60_000);
    return () => clearInterval(interval);
  }, [enDirect]);

  let titre: string;
  let valeur: string;
  if (e.etat === "ok") {
    titre = "documents prêts";
    valeur = "✓";
  } else if (e.etat === "arrive") {
    titre = "sans papiers depuis";
    valeur = `+${chrono(now.getTime() - checkIn.getTime())}`;
  } else if (e.etat === "retard") {
    titre = "limite J-1 dépassée de";
    valeur = `+${chrono(reste)}`;
  } else if (enDirect) {
    titre = "avant la limite J-1";
    valeur = chrono(reste);
  } else {
    titre = `limite ${formatUtcDayMonthTime(limite)}`;
    valeur = dureeCourte(reste);
  }

  const ficheOk = ficheStatut === "complete";
  const contratOk = contratStatut === "signe";
  const ficheTexte = ficheOk ? "Fiche police ✓" : progressionFiche ? (progressionFiche.includes("/") ? `Passeports ${progressionFiche.split(" ")[0]}` : progressionFiche) : ficheId ? "Fiche police en attente" : "Fiche police";
  const contratTexte = contratOk ? "Contrat ✓" : contratStatut ? "Contrat à signer" : "Contrat";
  const lisere = LISERE[villaType ?? "inconnu"];

  return (
    <Link
      href={`/reservations/${reservationId}`}
      title={e.detail}
      className={cn(
        // Téléphone : bulle compacte dans la bande défilante.
        "flex w-[10.25rem] shrink-0 snap-start flex-col gap-1.5 rounded-xl border border-l-[3px] bg-card px-2.5 py-2 transition-colors hover:bg-muted/40",
        // PC : ligne de grille dans le bloc, plus de bordure propre, séparée par un filet.
        masqueePc && "sm:hidden",
        "sm:grid sm:w-auto sm:h-[46px] sm:grid-cols-[14px_minmax(9rem,1.3fr)_minmax(0,1.6fr)_auto_minmax(7rem,auto)] sm:items-center sm:gap-x-3 sm:rounded-none sm:border-0 sm:border-b sm:border-l-[3px] sm:border-border sm:bg-transparent sm:px-3 sm:py-0",
        lisere
      )}
    >
      {/* Point d'état (PC seulement ; sur téléphone la couleur du délai suffit). */}
      <span className={cn("hidden h-2 w-2 shrink-0 rounded-full sm:block", POINT[e.tone])} aria-hidden />

      {/* Téléphone : villa + délai sur la même ligne. PC : colonne villa. */}
      <span className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight">{villaNom}</span>
          <span className="hidden text-[11px] leading-tight text-muted-foreground sm:block">
            {villaType === "appartement" ? "Appartement" : villaType === "villa" ? "Villa" : "Logement"}
          </span>
        </span>
        <span className={cn("shrink-0 text-[11.5px] tabular-nums sm:hidden", TEXTE[e.tone])} suppressHydrationWarning>
          {valeur}
        </span>
      </span>

      <span className="truncate text-[10.5px] text-muted-foreground sm:text-xs">
        {guestName} · <span className="sm:hidden">{formatUtcDayMonthTime(checkIn)}</span>
        <span className="hidden sm:inline">arrivée {formatUtcDayMonthTime(checkIn)}</span>
      </span>

      <span className="flex gap-1 sm:gap-1.5">
        <Badge ok={ficheOk} partiel={!ficheOk && Boolean(progressionFiche)} urgent={e.tone === "urgent"}>
          {ficheTexte}
        </Badge>
        <Badge ok={contratOk} partiel={false} urgent={e.tone === "urgent"}>
          {contratTexte}
        </Badge>
      </span>

      {/* PC : délai aligné à droite, avec son libellé dessous. */}
      <span className="hidden text-right sm:block">
        <span className={cn("block text-[12.5px] leading-tight tabular-nums", TEXTE[e.tone])} suppressHydrationWarning>
          {valeur}
        </span>
        <span className="block text-[10.5px] leading-tight text-muted-foreground">{titre}</span>
      </span>
    </Link>
  );
}

function Badge({ ok, partiel, urgent, children }: { ok: boolean; partiel: boolean; urgent: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-1.5 py-px text-[10px] leading-4 sm:px-2 sm:text-[11px]",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : partiel
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : urgent
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-border text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}
