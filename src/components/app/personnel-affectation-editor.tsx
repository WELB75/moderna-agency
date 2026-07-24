"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addPersonnelAffectation, removePersonnelAffectation } from "@/lib/actions/personnel";

export type PersonnelAssigne = { affectationId: string; personnelId: string; nom: string };

// Plusieurs personnes peuvent être affectées au même séjour (ex. 2-3 femmes de ménage pour
// une grande villa) : chacune apparaît en badge retirable, et le menu déroulant ne propose que
// celles qui ne sont pas déjà affectées.
export function PersonnelAffectationEditor({
  reservationId,
  label,
  assigned,
  options,
}: {
  reservationId: string;
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

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {assigned.map((a) => (
          <Badge key={a.affectationId} variant="secondary" className="gap-1 py-1 pr-1">
            {a.nom}
            <button
              type="button"
              onClick={() => handleRemove(a.affectationId)}
              disabled={isPending}
              className="rounded-full p-0.5 hover:bg-foreground/10"
              aria-label={`Retirer ${a.nom}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
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
