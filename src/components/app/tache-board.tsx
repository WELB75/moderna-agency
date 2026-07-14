"use client";

import { useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const COLUMNS: { statut: TacheStatut; label: string; headerClass: string }[] = [
  {
    statut: "en_attente",
    label: "En attente",
    headerClass: "text-muted-foreground",
  },
  {
    statut: "en_cours",
    label: "En cours",
    headerClass: "text-amber-600 dark:text-amber-400",
  },
  {
    statut: "termine",
    label: "Terminé",
    headerClass: "text-emerald-600 dark:text-emerald-400",
  },
];

function TacheCard({ tache }: { tache: Tache }) {
  const [isPending, startTransition] = useTransition();

  function handleStatutChange(statut: TacheStatut) {
    startTransition(async () => {
      try {
        await updateTacheStatut(tache.id, statut);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur lors de la mise à jour.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{tache.titre}</p>
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

      {tache.photoUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tache.photoUrls.map((url) => (
            <div key={url} className="relative h-14 w-14 overflow-hidden rounded">
              <Image src={url} alt="" fill sizes="56px" className="h-14 w-14 rounded object-cover" />
            </div>
          ))}
        </div>
      )}

      <Select value={tache.statut} onValueChange={(v) => handleStatutChange(v as TacheStatut)} disabled={isPending}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en_attente">En attente</SelectItem>
          <SelectItem value="en_cours">En cours</SelectItem>
          <SelectItem value="termine">Terminé</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TacheBoard({ taches }: { taches: Tache[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = taches.filter((t) => t.statut === col.statut);
        return (
          <div key={col.statut} className="space-y-3">
            <h2 className={cn("text-sm font-semibold uppercase tracking-wide", col.headerClass)}>
              {col.label} ({items.length})
            </h2>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Rien ici</p>
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
