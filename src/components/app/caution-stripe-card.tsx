"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { libererEmpreinte, prelevementCaution } from "@/lib/actions/caution";

const LIBELLES: Record<string, string> = {
  en_attente: "En attente du voyageur",
  autorisee: "Empreinte en place",
  liberee: "Empreinte levée",
  prelevee: "Caution prélevée",
  expiree: "Empreinte expirée",
  echec: "Échec de l'empreinte",
};

export function CautionStripeCard({
  reservationId,
  beds24BookingId,
  montantLibelle,
  statut,
  detail,
}: {
  reservationId: string;
  beds24BookingId: string;
  montantLibelle: string;
  statut: string | null;
  detail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [montant, setMontant] = useState("");

  function lancer(fn: () => Promise<void>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Caution (empreinte bancaire)</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {montantLibelle} · {statut ? LIBELLES[statut] ?? statut : "Pas encore demandée"}
        {detail ? ` · ${detail}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CopyLinkButton path={`/caution/${beds24BookingId}`} label="Copier le lien voyageur" successMessage="Lien de caution copié." />
        {statut === "autorisee" ? (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={pending} className="max-md:h-10">Libérer l&apos;empreinte</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Libérer l&apos;empreinte ?</AlertDialogTitle>
                  <AlertDialogDescription>Le montant réservé est rendu au voyageur, sans aucun débit.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => lancer(() => libererEmpreinte(reservationId), "Empreinte levée.")}>Libérer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={pending} className="text-destructive hover:text-destructive max-md:h-10">Prélever…</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Prélever sur la caution</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le montant saisi est réellement débité de la carte du voyageur (maximum {montantLibelle}). Le reste de l&apos;empreinte est rendu.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input inputMode="decimal" placeholder="Montant en €" value={montant} onChange={(e) => setMontant(e.target.value)} />
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction disabled={!montant.trim()} onClick={() => lancer(() => prelevementCaution(reservationId, montant), "Caution prélevée.")}>
                    Prélever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </div>
    </div>
  );
}
