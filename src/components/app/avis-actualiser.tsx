"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actualiserAvis } from "@/lib/actions/avis";

export function AvisActualiser() {
  const [enCours, demarrer] = useTransition();
  function lancer() {
    demarrer(async () => {
      try {
        const r = await actualiserAvis();
        const total = r.airbnb.avis + r.booking.avis;
        if (!r.success) toast.error(r.erreurs[0] ?? "Synchronisation impossible.");
        else if (r.erreurs.length > 0) toast.warning(`${total} avis lus, ${r.erreurs.length} logement(s) en erreur : ${r.erreurs[0]}`);
        else toast.success(`${total} avis synchronisés (Airbnb ${r.airbnb.avis}, Booking.com ${r.booking.avis}).`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Synchronisation impossible.");
      }
    });
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={lancer} disabled={enCours}>
      <RefreshCw className={enCours ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {enCours ? "Synchronisation…" : "Actualiser"}
    </Button>
  );
}
