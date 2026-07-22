"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";

export type GalleryOccupant = {
  id: string;
  nom: string | null;
  prenom: string | null;
  photoPieceUrl: string | null;
};

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
      <div className="flex flex-wrap gap-2">
        {occupants.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => o.photoPieceUrl && show(o.id)}
            className="flex w-20 flex-col items-center gap-1 text-center"
            disabled={!o.photoPieceUrl}
          >
            {o.photoPieceUrl ? (
              <Image
                src={o.photoPieceUrl}
                alt="Pièce d'identité"
                width={80}
                height={56}
                unoptimized
                className="h-14 w-20 rounded-md border object-cover"
              />
            ) : (
              <div className="flex h-14 w-20 items-center justify-center rounded-md border border-dashed text-[9px] text-amber-600 dark:text-amber-400">
                Pas de pièce
              </div>
            )}
            <span className="w-full truncate text-[10px] leading-tight">
              {[o.prenom, o.nom].filter(Boolean).join(" ") || "Sans nom"}
            </span>
          </button>
        ))}
      </div>

      {current ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
        >
          <div className="flex items-center justify-between text-white">
            <p className="text-sm font-medium">
              {[current.prenom, current.nom].filter(Boolean).join(" ") || "Sans nom"}
              <span className="ml-2 text-xs text-white/60">
                {openIndex! + 1} / {withPhoto.length}
              </span>
            </p>
            <div className="flex items-center gap-3">
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
