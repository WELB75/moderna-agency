"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { reconcilierCaisseSociete } from "@/lib/actions/caisse";

// "On repart de zéro" : Kamel, 2026-09-16, après un vrai règlement avec le boss où tout a été
// redonné — le solde société ne doit plus compter les mouvements d'avant. Les mouvements
// eux-mêmes restent visibles dans l'historique, seul le calcul du solde change de point de départ.
export function CaisseReconciliationButton({ moyenPaiement }: { moyenPaiement: "especes" | "virement" | "carte" }) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-muted-foreground">
          <RotateCcw className="h-3 w-3" />
          Repartir de zéro
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Repartir de zéro sur le solde société</AlertDialogTitle>
          <AlertDialogDescription>
            À utiliser seulement après un vrai règlement des comptes avec le boss. Le solde société
            ne comptera plus que les mouvements à partir de maintenant — l&apos;historique déjà
            enregistré reste visible mais n&apos;est plus compté dans le solde.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await reconcilierCaisseSociete(moyenPaiement);
                  toast.success("Solde société remis à zéro à partir de maintenant.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erreur.");
                }
              })
            }
          >
            Confirmer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
