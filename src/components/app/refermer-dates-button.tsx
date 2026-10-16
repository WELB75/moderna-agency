"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refermerDatesBeds24 } from "@/lib/actions/reservations";

// Referme (et revérifie) les nuits d'une réservation/blocage créé dans l'app sur Beds24, donc
// sur Airbnb et Booking.com — à utiliser quand la fermeture faite à la création a échoué.
export function RefermerDatesButton({ reservationId, urgent }: { reservationId: string; urgent: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      size="sm"
      variant={urgent ? "destructive" : "outline"}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const resultat = await refermerDatesBeds24(reservationId);
            if (resultat.statut === "echec") toast.error(resultat.detail, { duration: Infinity });
            else toast.success(resultat.detail);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur lors de la fermeture des dates.");
          }
        })
      }
    >
      <Lock className="h-4 w-4" />
      {isPending ? "Fermeture en cours…" : urgent ? "Refermer les dates sur Beds24" : "Revérifier la fermeture sur Beds24"}
    </Button>
  );
}
