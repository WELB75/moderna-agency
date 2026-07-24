"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignPersonnel } from "@/lib/actions/personnel";

export function PersonnelAssignSelect({
  reservationId,
  kind,
  currentId,
  options,
}: {
  reservationId: string;
  kind: "menage" | "cuisine";
  currentId: string | null;
  options: { id: string; nom: string }[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      try {
        await assignPersonnel(reservationId, kind, value === "none" ? null : value);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Select value={currentId ?? "none"} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="h-8 w-36 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Aucune</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
