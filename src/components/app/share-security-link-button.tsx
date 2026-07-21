"use client";

import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareSecurityLinkButton({ formId }: { formId: string }) {
  async function handleShare() {
    const url = `${window.location.origin}/securite/${formId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié — envoie-le à la sécurité du domaine.");
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare}>
      <ShieldCheck className="h-3.5 w-3.5" />
      Copier le lien sécurité
    </Button>
  );
}
