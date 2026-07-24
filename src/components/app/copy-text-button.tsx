"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Copie un résumé texte prêt à coller ailleurs (ex. envoyer les infos d'un séjour à un
// collègue sur WhatsApp) sans avoir à ressaisir quoi que ce soit.
export function CopyTextButton({ text, label = "Copier" }: { text: string; label?: string }) {
  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Infos copiées — colle-les où tu veux.");
    } catch {
      toast.error("Impossible de copier.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      <Copy className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
