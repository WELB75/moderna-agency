"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Share2, RotateCw } from "lucide-react";
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
import { regenerateProprietaireToken } from "@/lib/actions/proprietaire-access";

export function ProprietaireAccessButton({
  villaId,
  token,
}: {
  villaId: string;
  token: string;
}) {
  const [currentToken, setCurrentToken] = useState(token);
  const [isPending, startTransition] = useTransition();

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/p/${currentToken}`);
    toast.success("Lien copié — envoie-le au propriétaire.");
  }

  function handleRegenerate() {
    startTransition(async () => {
      try {
        const updated = await regenerateProprietaireToken(villaId);
        if (updated) setCurrentToken(updated.lienProprietaireToken);
        toast.success("Nouveau lien généré, l'ancien ne fonctionne plus.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
        <Share2 className="h-3.5 w-3.5" />
        Copier le lien propriétaire
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Régénérer le lien">
            <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer le lien propriétaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;ancien lien cessera de fonctionner immédiatement. À utiliser si le lien a été
              partagé par erreur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleRegenerate}>
              Régénérer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
