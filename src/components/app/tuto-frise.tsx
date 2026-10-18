/* eslint-disable @next/next/no-img-element */
import { Check, TriangleAlert } from "lucide-react";
import type { Tuto } from "@/lib/tutos";

// Frise verticale d'un tuto : une ligne qui descend, une pastille numérotée par étape, la photo
// puis sa légende en dessous, jusqu'à la pastille verte de fin. Lisible sur téléphone (c'est là
// qu'on la lit, devant l'installation). Sans dépendance à l'app : sert aussi la page publique.
export function TutoFrise({ tuto }: { tuto: Tuto }) {
  return (
    <div className="space-y-5">
      {tuto.brouillon ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          Brouillon : étapes en cours de vérification, à ne pas encore diffuser.
        </p>
      ) : null}

      <ol className="relative space-y-8 border-l-2 border-border pl-6 sm:pl-8">
        {tuto.etapes.map((etape, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[2.35rem] top-0 flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-4 ring-background sm:-left-[2.85rem]">
              {i + 1}
            </span>
            <figure className="overflow-hidden rounded-xl border bg-card">
              <img src={etape.image} alt={`Étape ${i + 1}`} className="max-h-[28rem] w-full bg-muted object-contain" loading="lazy" />
              <figcaption className="space-y-2 p-3 text-sm sm:p-4 sm:text-base">
                <p className="font-medium leading-snug">{etape.legende}</p>
                {etape.attention ? (
                  <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 sm:text-sm">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    {etape.attention}
                  </p>
                ) : null}
              </figcaption>
            </figure>
          </li>
        ))}

        <li className="relative">
          <span className="absolute -left-[2.35rem] top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 text-white ring-4 ring-background sm:-left-[2.85rem]">
            <Check className="size-5" />
          </span>
          <p className="rounded-xl bg-emerald-600/10 px-4 py-3 text-lg font-semibold text-emerald-700 dark:text-emerald-400">{tuto.fin}</p>
        </li>
      </ol>
    </div>
  );
}
