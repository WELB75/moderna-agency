"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/app/confirm-delete-button";
import { updateTacheStatut, deleteTache } from "@/lib/actions/taches";
import { cn } from "@/lib/utils";

type TacheStatut = "en_attente" | "en_cours" | "termine";

type Tache = {
  id: string;
  titre: string;
  description: string | null;
  statut: TacheStatut;
  photoUrls: string[];
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  createdAt: Date;
};

const COLUMNS: { statut: TacheStatut; label: string; headerClass: string; dotClass: string }[] = [
  {
    statut: "en_attente",
    label: "En attente",
    headerClass: "text-muted-foreground",
    dotClass: "bg-muted-foreground",
  },
  {
    statut: "en_cours",
    label: "En cours",
    headerClass: "text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
  {
    statut: "termine",
    label: "Terminé",
    headerClass: "text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
];

const STATUT_SELECT_CLASS: Record<TacheStatut, string> = {
  en_attente: "",
  en_cours: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  termine: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function PhotoLightbox({
  photoUrls,
  open,
  index,
  onOpenChange,
  onIndexChange,
}: {
  photoUrls: string[];
  open: boolean;
  index: number;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-4xl border-none bg-transparent p-0 shadow-none sm:max-w-4xl [&>button]:text-white [&>button]:opacity-100"
      >
        <DialogTitle className="sr-only">Photo</DialogTitle>
        <div className="relative flex h-[80vh] w-full items-center justify-center overflow-hidden rounded-lg bg-black">
          <Image
            src={photoUrls[index]}
            alt=""
            fill
            sizes="90vw"
            className="object-contain"
            priority
          />
          {photoUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => onIndexChange((index - 1 + photoUrls.length) % photoUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => onIndexChange((index + 1) % photoUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                {index + 1} / {photoUrls.length}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TacheCard({ tache }: { tache: Tache }) {
  const [isPending, startTransition] = useTransition();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  function handleStatutChange(statut: TacheStatut) {
    startTransition(async () => {
      try {
        await updateTacheStatut(tache.id, statut);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  function openLightbox(index: number) {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      {tache.photoUrls.length > 0 ? (
        <button
          type="button"
          onClick={() => openLightbox(0)}
          className="relative block aspect-[4/3] w-full overflow-hidden bg-muted"
        >
          <Image
            src={tache.photoUrls[0]}
            alt={tache.titre}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform hover:scale-105"
          />
          {tache.photoUrls.length > 1 && (
            <Badge className="absolute bottom-2 right-2 bg-black/70 text-white hover:bg-black/70">
              +{tache.photoUrls.length - 1} photo{tache.photoUrls.length > 2 ? "s" : ""}
            </Badge>
          )}
        </button>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
          <ImageOff className="h-6 w-6" />
        </div>
      )}

      <div className="space-y-2.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug">{tache.titre}</p>
          <ConfirmDeleteButton
            action={deleteTache.bind(null, tache.id)}
            title="Supprimer cette tâche ?"
            description="Cette action est irréversible."
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {tache.domaineNom ? `${tache.domaineNom} — ` : ""}
          {tache.villaNom} (n°{tache.villaNumero})
        </p>

        {tache.description ? <p className="text-sm">{tache.description}</p> : null}

        {tache.photoUrls.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {tache.photoUrls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => openLightbox(i)}
                className="relative h-12 w-12 overflow-hidden rounded border"
              >
                <Image src={url} alt="" fill sizes="48px" className="object-cover" />
              </button>
            ))}
          </div>
        )}

        <Select value={tache.statut} onValueChange={(v) => handleStatutChange(v as TacheStatut)} disabled={isPending}>
          <SelectTrigger className={cn("w-full", STATUT_SELECT_CLASS[tache.statut])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="termine">Terminé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tache.photoUrls.length > 0 && (
        <PhotoLightbox
          photoUrls={tache.photoUrls}
          open={lightboxOpen}
          index={lightboxIndex}
          onOpenChange={setLightboxOpen}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}

export function TacheBoard({ taches }: { taches: Tache[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = taches.filter((t) => t.statut === col.statut);
        return (
          <div key={col.statut} className="space-y-3">
            <h2 className={cn("flex items-center gap-2 text-sm font-semibold uppercase tracking-wide", col.headerClass)}>
              <span className={cn("h-2 w-2 rounded-full", col.dotClass)} />
              {col.label} ({items.length})
            </h2>
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Rien ici
                </p>
              ) : (
                items.map((tache) => <TacheCard key={tache.id} tache={tache} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
