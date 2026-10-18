"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Tuto } from "@/lib/tutos";

// Parcours d'un tuto, une étape à la fois : une ligne horizontale de progression en haut (les
// pastilles se remplissent à mesure qu'on avance, on peut cliquer pour revenir), la photo en
// grand avec sa légende, puis un écran de fin animé. Navigation au doigt (glisser), aux boutons
// ou aux flèches du clavier. Les animations se coupent si le téléphone demande "réduire les
// animations". Sert aussi la page publique /tuto/[code], donc aucune dépendance à l'app.
export function TutoFrise({ tuto }: { tuto: Tuto }) {
  const total = tuto.etapes.length; // l'écran de fin est l'index `total`
  const [index, setIndex] = useState(0);
  const [sens, setSens] = useState<"avant" | "arriere">("avant");
  const departX = useRef<number | null>(null);

  const aller = useCallback(
    (cible: number) => {
      const borne = Math.max(0, Math.min(total, cible));
      setIndex((courant) => {
        if (borne === courant) return courant;
        setSens(borne > courant ? "avant" : "arriere");
        return borne;
      });
    },
    [total]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") aller(index + 1);
      if (e.key === "ArrowLeft") aller(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aller, index]);

  const estFin = index === total;
  const etape = estFin ? null : tuto.etapes[index];
  const progression = (index / total) * 100;
  const entree = sens === "avant" ? "slide-in-from-right-8" : "slide-in-from-left-8";

  return (
    <div className="space-y-5">
      {tuto.brouillon ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          Brouillon : étapes en cours de vérification, à ne pas encore diffuser.
        </p>
      ) : null}

      {/* Ligne de progression : pastilles reliées, la partie parcourue se remplit. */}
      <nav aria-label="Étapes" className="px-4">
        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${progression}%` }}
          />
          <ol className="relative flex items-center justify-between">
            {Array.from({ length: total + 1 }, (_, i) => {
              const fini = i < index;
              const courant = i === index;
              const derniere = i === total;
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => aller(i)}
                    aria-label={derniere ? tuto.fin : `Étape ${i + 1}`}
                    aria-current={courant ? "step" : undefined}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-background transition-all duration-300 motion-reduce:transition-none",
                      courant && "scale-125",
                      fini || courant
                        ? derniere
                          ? "bg-emerald-600 text-white"
                          : "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {fini && !derniere ? <Check className="size-4" /> : derniere ? <Check className="size-4" /> : i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {estFin ? "Terminé" : `Étape ${index + 1} sur ${total}`}
        </p>
      </nav>

      {/* Scène : la clé relance l'animation d'entrée à chaque changement d'étape. */}
      <div
        key={index}
        onTouchStart={(e) => {
          departX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const debut = departX.current;
          departX.current = null;
          const fin = e.changedTouches[0]?.clientX;
          if (debut == null || fin == null) return;
          if (fin - debut < -50) aller(index + 1);
          if (fin - debut > 50) aller(index - 1);
        }}
        className={cn("animate-in fade-in duration-300 motion-reduce:animate-none", entree)}
      >
        {etape ? (
          <figure className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <img src={etape.image} alt={`Étape ${index + 1}`} className="max-h-[26rem] w-full bg-muted object-contain" />
            <figcaption className="space-y-3 p-4 sm:p-5">
              <p className="text-base font-semibold leading-snug sm:text-lg">{etape.legende}</p>
              {etape.attention ? (
                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {etape.attention}
                </p>
              ) : null}
            </figcaption>
          </figure>
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-2xl border bg-emerald-600/5 px-4 py-10 text-center">
            <div className="relative flex size-24 items-center justify-center">
              <span className="tuto-ripple absolute inset-0 rounded-full bg-emerald-500/40 [animation:tuto-ripple_2s_ease-out_infinite]" />
              <span className="tuto-ripple absolute inset-0 rounded-full bg-emerald-500/40 [animation:tuto-ripple_2s_ease-out_0.9s_infinite]" />
              <span className="relative flex size-24 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg">
                <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    className="tuto-check-draw"
                    style={{ strokeDasharray: 30, animation: "tuto-check-draw 0.7s 0.2s ease-out both" }}
                  />
                </svg>
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{tuto.fin}</p>
              <p className="text-sm text-muted-foreground">Toutes les étapes sont faites, on peut partir.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => aller(index - 1)} disabled={index === 0} className="h-11 px-5">
          <ArrowLeft />
          Précédent
        </Button>
        {estFin ? (
          <Button type="button" onClick={() => aller(0)} className="h-11 px-5">
            <RotateCcw />
            Revoir depuis le début
          </Button>
        ) : (
          <Button type="button" onClick={() => aller(index + 1)} className="h-11 px-5">
            {index === total - 1 ? "Terminer" : "Étape suivante"}
            <ArrowRight />
          </Button>
        )}
      </div>

      {/* Précharge la photo suivante pour que le passage soit instantané. */}
      {index < total - 1 ? <img src={tuto.etapes[index + 1].image} alt="" className="hidden" /> : null}
    </div>
  );
}
