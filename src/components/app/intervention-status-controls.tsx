"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTERVENTION_STEPS, type Etape } from "@/lib/intervention-steps";
import { URGENCE_LEVELS, type Urgence } from "@/lib/intervention-urgence";
import { setInterventionEtapePublic, setInterventionUrgencePublic } from "@/lib/actions/interventions";

export function InterventionStatusControls({
  interventionId,
  etape,
  urgence,
}: {
  interventionId: string;
  etape: Etape;
  urgence: Urgence;
}) {
  const [isPending, startTransition] = useTransition();

  function handleEtapeChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionEtapePublic(interventionId, value as Etape);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleUrgenceChange(value: string) {
    startTransition(async () => {
      try {
        await setInterventionUrgencePublic(interventionId, value as Urgence);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={etape} onValueChange={handleEtapeChange} disabled={isPending}>
        <SelectTrigger className="h-9 w-full text-sm sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERVENTION_STEPS.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={urgence} onValueChange={handleUrgenceChange} disabled={isPending}>
        <SelectTrigger className="h-9 w-full text-sm sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {URGENCE_LEVELS.map((u) => (
            <SelectItem key={u.key} value={u.key}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
