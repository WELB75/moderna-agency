"use client";

import { useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markAffectationsPaid } from "@/lib/actions/personnel";

type PaiementDetail = { villaId: string | null; villaNom: string | null; villaNumero: string | null; montant: number };

// Marque payées d'un coup toutes les affectations dues de cette personne — évite de cocher
// chaque ménage/jour de cuisine un par un après un paiement en liquide. Ajoute aussi
// automatiquement la dépense correspondante dans la caisse (payé en liquide, nom de la
// personne renseigné) pour ne pas avoir à la ressaisir à la main.
export function MarkPaidButton({
  affectationIds,
  personnelNom,
  role,
  details,
}: {
  affectationIds: string[];
  personnelNom: string;
  role: "menage" | "cuisine";
  details: PaiementDetail[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await markAffectationsPaid(affectationIds, personnelNom, role, details);
        toast.success("Marqué payé et ajouté aux dépenses de la caisse.");
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
