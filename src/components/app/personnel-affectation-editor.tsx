"use client";

import { useState, useTransition } from "react";
import { X, Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addPersonnelAffectation,
  removePersonnelAffectation,
  toggleAffectationFait,
  updateAffectationJours,
} from "@/lib/actions/personnel";

export type PersonnelAssigne = {
  affectationId: string;
  personnelId: string;
  nom: string;
  faitAt: Date | null;
  nbJours: number | null;
};

// Plusieurs personnes peuvent être affectées au même séjour (ex. 2-3 femmes de ménage pour
// une grande villa) : chacune apparaît en badge retirable, et le menu déroulant ne propose que
// celles qui ne sont pas déjà affectées. Le ménage se confirme fait (preuve pour les stats) ;
// la cuisine peut préciser un nombre de jours si ce n'était pas tout le séjour.
export function PersonnelAffectationEditor({
  reservationId,
  role,
  label,
  assigned,
  options,
}: {
  reservationId: string;
  role: "menage" | "cuisine";
  label: string;
  assigned: PersonnelAssigne[];
  options: { id: string; nom: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const assignedIds = new Set(assigned.map((a) => a.personnelId));
  const availableOptions = options.filter((o) => !assignedIds.has(o.id));

  function handleAdd(personnelId: string) {
    startTransition(async () => {
      try {
        await addPersonnelAffectation(reservationId, personnelId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleRemove(affectationId: string) {
    startTransition(async () => {
      try {
        await removePersonnelAffectation(affectationId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleToggleFait(affectationId: string, fait: boolean) {
    startTransition(async () => {
      try {
        await toggleAffectationFait(affectationId, fait);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {assigned.map((a) =>
          role === "menage" ? (
            <MenageBadge key={a.affectationId} a={a} disabled={isPending} onToggleFait={handleToggleFait} onRemove={handleRemove} />
          ) : (
            <CuisineBadge key={a.affectationId} a={a} disabled={isPending} onRemove={handleRemove} />
          )
        )}
        {availableOptions.length > 0 ? (
          <Select value="" onValueChange={handleAdd} disabled={isPending}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="+ Ajouter" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : options.length === 0 ? (
          <span className="text-xs text-muted-foreground">Personne dans l&apos;équipe (onglet Équipe)</span>
        ) : (
          <span className="text-xs text-muted-foreground">Toute l&apos;équipe est déjà affectée ici</span>
        )}
      </div>
    </div>
  );
}

function MenageBadge({
  a,
  disabled,
  onToggleFait,
  onRemove,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  onToggleFait: (affectationId: string, fait: boolean) => void;
  onRemove: (affectationId: string) => void;
}) {
  const fait = Boolean(a.faitAt);
  return (
    <Badge
      variant={fait ? "default" : "secondary"}
      className={cn("gap-1 py-1 pr-1", fait && "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-600")}
    >
      <button
        type="button"
        onClick={() => onToggleFait(a.affectationId, !fait)}
        disabled={disabled}
        className="flex items-center gap-1"
        title={fait ? "Ménage confirmé fait au départ — cliquer pour annuler" : "Cliquer pour confirmer que le ménage a été fait"}
      >
        {fait ? <Check className="h-3 w-3" /> : null}
        {a.nom}
      </button>
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled}
        className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        aria-label={`Retirer ${a.nom}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function CuisineBadge({
  a,
  disabled,
  onRemove,
}: {
  a: PersonnelAssigne;
  disabled: boolean;
  onRemove: (affectationId: string) => void;
}) {
  const [jours, setJours] = useState(a.nbJours != null ? String(a.nbJours) : "");
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    const parsed = jours.trim() === "" ? null : Math.max(1, parseInt(jours, 10));
    if (parsed === a.nbJours || (parsed === null && a.nbJours === null)) return;
    startTransition(async () => {
      try {
        await updateAffectationJours(a.affectationId, Number.isNaN(parsed as number) ? null : parsed);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Badge variant="secondary" className="gap-1 py-1 pr-1">
      {a.nom}
      <Input
        type="number"
        min={1}
        value={jours}
        onChange={(e) => setJours(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled || isPending}
        placeholder="j"
        title="Nombre de jours si ce n'est pas tout le séjour"
        className="h-5 w-10 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
      />
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled}
        className="rounded-full p-0.5 hover:bg-foreground/10"
        aria-label={`Retirer ${a.nom}`}
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}
