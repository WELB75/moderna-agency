"use client";

import { useTransition } from "react";
import { Star, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setStayRating } from "@/lib/actions/personnel";

// Saisie manuelle de la note client (1 à 5) collectée par le message de départ — ce message part
// du téléphone personnel de l'équipe (pas du numéro du bot WhatsApp), donc la réponse du client
// n'arrive pas automatiquement dans le système. L'équipe la reporte ici après l'avoir lue.
export function StayRatingButton({ reservationId }: { reservationId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick(note: number) {
    startTransition(async () => {
      try {
        await setStayRating(reservationId, note);
        toast.success(`Note ${note}/5 enregistrée.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isPending}>
          <Star className="h-3.5 w-3.5" />
          Note client
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {[5, 4, 3, 2, 1].map((n) => (
          <DropdownMenuItem key={n} onClick={() => handleClick(n)}>
            {n}/5
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
