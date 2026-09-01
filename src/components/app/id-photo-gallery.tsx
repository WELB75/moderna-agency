"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Download, ZoomIn, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryOccupant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  photoPieceUrl: string | null;
};

// Galerie des pièces d'identité pour le contrôle sécurité — présentée telle quelle (lisible sans
// avoir à cliquer) plutôt qu'en vignettes recadrées serrées : Kamel, 2026-09-01, page destinée à
// être montrée au ministre de la Défense, "j'aimerais qu'on ait les passeports en taille normal
// déjà [...] rend ça propre fluide et pro". object-contain (jamais cover) pour ne jamais rogner
// un bord du document ; le clic garde un agrandissement plein écran pour le détail le plus fin.
export function IdPhotoGallery({ occupants }: { occupants: GalleryOccupant[] }) {
  const withPhoto = occupants.filter((o) => o.photoPieceUrl);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const current = openIndex !== null ? withPhoto[openIndex] : null;

  function show(id: string) {
    const idx = withPhoto.findIndex((o) => o.id === id);
    if (idx >= 0) setOpenIndex(idx);
  }

  function next() {
    if (openIndex === null) return;
    setOpenIndex((openIndex + 1) % withPhoto.length);
  }

  function prev() {
    if (openIndex === null) return;
    setOpenIndex((openIndex - 1 + withPhoto.length) % withPhoto.length);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {occupants.map((o) => {
          const name = [o.prenom, o.nom].filter(Boolean).join(" ") || "Sans nom";
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => o.photoPieceUrl && show(o.id)}
              disabled={!o.photoPieceUrl}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all",
                o.photoPieceUrl && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              )}
            >
              <div className="relative aspect-[3/2] w-full shrink-0 bg-muted/40">
                {o.photoPieceUrl ? (
                  <>
                    <Image
                      src={o.photoPieceUrl}
                      alt={`Pièce d'identité — ${name}`}
                      fill
                      unoptimized
                      className="object-contain p-1.5"
                    />
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      <ZoomIn className="h-3.5 w-3.5" />
                    </span>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <IdCard className="h-6 w-6" strokeWidth={1.5} />
                    <span className="text-xs font-medium">Pas de pièce</span>
                  </div>
                )}
              </div>
              <div className="border-t border-border px-3 py-2.5">
                <p className="truncate text-sm font-semibold leading-tight">{name}</p>
              </div>
            </button>
          );
        })}
      </div>

      {current ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <div className="flex items-center justify-between gap-2 text-white">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {[current.prenom, current.nom].filter(Boolean).join(" ") || "Sans nom"}
              <span className="ml-2 text-xs text-white/60">
                {openIndex! + 1} / {withPhoto.length}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <a
                href={current.photoPieceUrl!}
                download={`piece-identite-${[current.prenom, current.nom].filter(Boolean).join("-") || current.id}.jpg`}
                onClick={(e) => e.stopPropagation()}
                className="text-white/80 hover:text-white"
                aria-label="Télécharger"
              >
                <Download className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                className="text-white/80 hover:text-white"
                aria-label="Fermer"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {withPhoto.length > 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="absolute left-0 z-10 flex h-12 w-12 items-center justify-center text-white/80 hover:text-white"
                aria-label="Précédent"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
            ) : null}

            <Image
              src={current.photoPieceUrl!}
              alt="Pièce d'identité"
              width={1200}
              height={800}
              unoptimized
              className="max-h-full max-w-full rounded-md object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {withPhoto.length > 1 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="absolute right-0 z-10 flex h-12 w-12 items-center justify-center text-white/80 hover:text-white"
                aria-label="Suivant"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
