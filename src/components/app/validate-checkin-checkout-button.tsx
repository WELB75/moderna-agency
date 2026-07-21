"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { validateReservationEvent, unvalidateReservationEvent } from "@/lib/actions/reservations";
import { formatUtcDayMonthTime } from "@/lib/now";

export function ValidateCheckinCheckoutButton({
  reservationId,
  kind,
  valideAt,
  validePar,
}: {
  reservationId: string;
  kind: "in" | "out";
  valideAt: Date | null;
  validePar: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const label = kind === "in" ? "Check-in effectué" : "Check-out effectué";

  function handleValidate() {
    startTransition(async () => {
      try {
        await validateReservationEvent(reservationId, kind);
        toast.success(label);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  function handleUndo() {
    startTransition(async () => {
      try {
        await unvalidateReservationEvent(reservationId, kind);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  if (valideAt) {
    return (
      <div className="flex items-center gap-1">
        <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" variant="outline">
          <CircleCheck className="h-3.5 w-3.5" />
          {label}
          {validePar ? ` · ${validePar}` : ""} · {formatUtcDayMonthTime(valideAt)}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            handleUndo();
          }}
          title="Annuler la validation"
        >
          <Undo2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 text-xs text-emerald-700 dark:text-emerald-400"
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        handleValidate();
      }}
    >
      <CircleCheck className="h-3.5 w-3.5" />
      Valider {kind === "in" ? "le check-in" : "le check-out"}
    </Button>
  );
}
