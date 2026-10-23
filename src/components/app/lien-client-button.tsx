"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lienClientSejour } from "@/lib/actions/contrats";

// Copie le lien unique du client pour un séjour (/g/[fiche]) : fiche police si elle n'est pas
// faite, puis signature des conditions déjà pré-remplies. Sans fiche connue, l'action la crée.
export async function copierLienClient(reservationId: string, ficheId: string | null): Promise<void> {
  const chemin = ficheId ? `/g/${ficheId}` : await lienClientSejour(reservationId);
  const url = `${window.location.origin}${chemin}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Lien client copié : il n'a plus qu'à signer.");
  } catch {
    toast.message("Copie impossible, voici le lien :", { description: url, duration: 15000 });
  }
}

export function LienClientButton({
  reservationId,
  ficheId,
  label = "Copier le lien client",
  iconOnly = false,
}: {
  reservationId: string;
  ficheId: string | null;
  label?: string;
  iconOnly?: boolean;
}) {
  const [enCours, setEnCours] = useState(false);

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

  const icone = enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />;
  if (iconOnly) {
    return (
      <Button type="button" variant="ghost" size="icon" onClick={copier} disabled={enCours} className="shrink-0 max-md:size-11" aria-label={label} title={label}>
        {icone}
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copier} disabled={enCours} className="max-md:h-10">
      {icone}
      {label}
    </Button>
  );
}
