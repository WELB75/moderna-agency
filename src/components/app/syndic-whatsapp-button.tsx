"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toWhatsAppUrl } from "@/lib/phone";
import { formaterNumero } from "@/lib/syndic-numeros";

// Envoie au syndic / gardien de la résidence le lien du dossier du séjour (déclaration, contrat,
// photos des pièces) : un message WhatsApp prêt à partir, comme le « Message sécurité » des villas.
// Rédigé en darija, comme le message sécurité (src/lib/message-templates.ts).
export function SyndicWhatsAppButton({
  reservationId,
  numeros,
  guestName,
  residence,
  numeroAppartement,
  du,
  au,
}: {
  reservationId: string;
  numeros: string[];
  guestName: string;
  residence: string;
  numeroAppartement: string | null;
  du: string;
  au: string;
}) {
  const [copie, setCopie] = useState(false);
  const [numero, setNumero] = useState(numeros[0] ?? "");
  const lien = () => `${window.location.origin}/syndic/${reservationId}`;

  function envoyer() {
    if (!numero) return;
    const message =
      `السلام عليكم،\n\nهادا ملف الضيف (${guestName}) اللي غادي يسكن فـ شقة رقم ${numeroAppartement ?? ""}` +
      `${residence ? ` (إقامة ${residence})` : ""} من ${du} حتى ${au}.\n\n` +
      `فيه التصريح بالشرف، العقد وصور الوثائق:\n\n${lien()}\n\nشكرا`;
    window.open(toWhatsAppUrl(numero, message), "_blank");
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien());
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {numeros.length > 1 ? (
        <select
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          aria-label="Numéro du syndic"
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {numeros.map((n, i) => (
            <option key={n} value={n}>
              {`Numéro ${i + 1} : ${formaterNumero(n)}`}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="button" size="sm" onClick={envoyer} disabled={!numero}>
        <Send className="h-3.5 w-3.5" />
        Envoyer au syndic sur WhatsApp
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={copier}>
        {copie ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        Copier le lien
      </Button>
      {!numero ? (
        <span className="text-xs text-muted-foreground">Renseigne le WhatsApp du syndic ci-dessus pour l&apos;envoi direct.</span>
      ) : null}
    </div>
  );
}
