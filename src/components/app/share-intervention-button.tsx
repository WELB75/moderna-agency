"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareInterventionButton({ interventionId }: { interventionId: string }) {
  async function handleShare() {
    const url = `${window.location.origin}/i/${interventionId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié — envoie-le à Imed Jaiel, il l'ouvre sans se connecter.");
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare}>
      <Share2 className="h-3.5 w-3.5" />
      Copier le lien pour Imed Jaiel
    </Button>
  );
}
