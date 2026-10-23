"use client";

import Link from "next/link";
import { useState } from "react";
import { FileSignature } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copierLienClient } from "@/components/app/lien-client-button";

// Conditions de séjour d'une réservation. Signées : ouvre le contrat. Pas encore signées : un clic
// copie le lien unique du client (/g/[fiche]), qui fait remplir la fiche police si besoin puis
// signer les conditions déjà pré-remplies — plus aucun formulaire à remplir à la main (Kamel,
// 2026-10-23 : « tout doit se remplir seul et ils ont juste à signer »).
export function ContratStatusChip({
  contratId,
  contratStatut,
  reservationId,
  ficheId = null,
}: {
  contratId: string | null;
  contratStatut: "signe" | "en_attente" | null;
  villaId?: string | null;
  reservationId: string;
  ficheId?: string | null;
}) {
  const [enCours, setEnCours] = useState(false);
  const done = contratStatut === "signe";
  const classes = cn(
    "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
    done
      ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 dark:border-emerald-500/20"
      : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 dark:border-amber-500/20"
  );
  const contenu = (
    <>
      <FileSignature className={cn("h-3.5 w-3.5 shrink-0", done ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")} />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Conditions · </span>
        <span className="font-medium text-foreground">{done ? "Signé" : "À signer"}</span>
        {done ? null : <span className="text-muted-foreground"> · copier le lien</span>}
      </span>
    </>
  );

  if (done && contratId) {
    return (
      <Link href={`/contrats/${contratId}`} className={classes}>
        {contenu}
      </Link>
    );
  }

  async function copier() {
    setEnCours(true);
    try {
      await copierLienClient(reservationId, ficheId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de créer le lien.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <button type="button" onClick={copier} disabled={enCours} className={cn(classes, "text-left disabled:opacity-60")} title="Copier le lien client (fiche police + signature des conditions)">
      {contenu}
    </button>
  );
}
