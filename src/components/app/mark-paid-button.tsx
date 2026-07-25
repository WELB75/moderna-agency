"use client";

import { useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAffectationsPaid } from "@/lib/actions/personnel";

// Marque payées d'un coup toutes les affectations dues de cette personne — évite de cocher
// chaque ménage/jour de cuisine un par un après un paiement en liquide.
export function MarkPaidButton({ affectationIds }: { affectationIds: string[] }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await markAffectationsPaid(affectationIds);
        toast.success("Marqué payé.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      <CircleCheck className="h-3.5 w-3.5" />
      Marquer payé
    </Button>
  );
}
