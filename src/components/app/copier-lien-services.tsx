"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { originApp } from "@/lib/app-origin";

// Copie le lien de l'espace voyageur (/sejour/[id]) pour l'envoyer au client sur WhatsApp.
export function CopierLienServices({ reservationId }: { reservationId: string }) {
  const [copie, setCopie] = useState(false);
  async function copier(e: React.MouseEvent) {
    e.preventDefault();
    const lien = `${originApp()}/sejour/${reservationId}`;
    try {
      await navigator.clipboard.writeText(lien);
    } catch {
      window.prompt("Copiez le lien :", lien);
    }
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copier}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      title="Copier le lien services et activités à envoyer au voyageur"
    >
      {copie ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
      {copie ? "Lien copié" : "Lien services"}
    </button>
  );
}
