"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { togglePersonnelActif } from "@/lib/actions/personnel";

export function PersonnelActifToggle({ personnelId, actif }: { personnelId: string; actif: boolean }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: boolean) {
    startTransition(async () => {
      try {
        await togglePersonnelActif(personnelId, value);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <span className="flex items-center max-md:min-h-11 max-md:px-1">
      <Switch checked={actif} onCheckedChange={handleChange} disabled={isPending} />
    </span>
  );
}
