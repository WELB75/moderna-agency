"use client";

import { useState, useTransition } from "react";
import { X, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

// Bouton (pas juste un badge à plat) pour que ce soit visuellement clair que c'est cliquable :
// gris avec cercle vide = pas encore fait, vert avec coche = confirmé, comme un interrupteur.
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
    <div className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        variant={fait ? "default" : "outline"}
        size="sm"
        onClick={() => onToggleFait(a.affectationId, !fait)}
        disabled={disabled}
        className={cn(fait && "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-600")}
        title={fait ? "Ménage confirmé fait au départ — cliquer pour annuler" : "Cliquer pour confirmer que le ménage a été fait"}
      >
        {fait ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        {a.nom}
      </Button>
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Retirer ${a.nom}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
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
    <div className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium">
      {a.nom}
      <Input
        type="number"
        min={1}
        value={jours}
        onChange={(e) => setJours(e.target.value)}
        onBlur={handleBlur}
        disabled={disabled || isPending}
        placeholder="nb"
        title="Nombre de jours si ce n'est pas tout le séjour"
        className="h-5 w-8 border-none bg-transparent p-0 text-center text-xs shadow-none focus-visible:ring-1"
      />
      <span className="text-muted-foreground">{jours === "1" ? "jour" : "jours"}</span>
      <button
        type="button"
        onClick={() => onRemove(a.affectationId)}
        disabled={disabled}
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Retirer ${a.nom}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
