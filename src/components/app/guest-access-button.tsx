"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Share2, RotateCw, QrCode } from "lucide-react";
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
import { regenerateGuestToken } from "@/lib/actions/guest-access";

export function GuestAccessButton({ villaId, token }: { villaId: string; token: string }) {
  const [currentToken, setCurrentToken] = useState(token);
  const [isPending, startTransition] = useTransition();

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/bienvenue/${currentToken}`);
    toast.success("Lien copié — à afficher/imprimer dans la villa.");
  }

  function handleRegenerate() {
    startTransition(async () => {
      try {
        const updated = await regenerateGuestToken(villaId);
        if (updated) setCurrentToken(updated.lienClientToken);
        toast.success("Nouveau lien généré, l'ancien (et son QR déjà imprimé) ne fonctionne plus.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
        <Share2 className="h-3.5 w-3.5" />
        Copier le lien d&apos;accueil
      </Button>
      <Button type="button" variant="outline" size="sm" asChild>
        <Link href={`/villas/${villaId}/qr`} target="_blank">
          <QrCode className="h-3.5 w-3.5" />
          Voir / imprimer le QR
        </Link>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Régénérer le lien">
            <RotateCw className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Régénérer le lien d&apos;accueil ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;ancien lien (et le QR déjà imprimé) cesseront de fonctionner immédiatement. À
              utiliser si le lien a été partagé par erreur.
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
