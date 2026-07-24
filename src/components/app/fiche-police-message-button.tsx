"use client";

import { useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildFichePoliceMessage } from "@/lib/message-templates";

// Crée la fiche gendarmerie si besoin (comme GendarmerieAction) et ouvre directement
// WhatsApp avec le message habituel de Kamel + le lien du formulaire, prêt à envoyer.
export function FichePoliceMessageButton({
  reservationId,
  villaId,
  phone,
  guestName,
  ficheId,
}: {
  reservationId: string;
  villaId: string;
  phone: string;
  guestName: string;
  ficheId: string | null;
}) {
  const [id, setId] = useState(ficheId);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        let formId = id;
        if (!formId) {
          const created = await createGendarmerieForm(reservationId, villaId);
          formId = created.id;
          setId(formId);
        }
        const link = `${window.location.origin}/g/${formId}`;
        window.open(toWhatsAppUrl(phone, buildFichePoliceMessage(guestName, link)), "_blank");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      <FileText className="h-3.5 w-3.5" />
      Message fiche police
    </Button>
  );
}
