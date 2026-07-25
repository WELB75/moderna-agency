"use client";

import { useState, useTransition } from "react";
import { MessageCircleMore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildArrivalMessage } from "@/lib/message-templates";

// Un seul message, un seul bouton : demande l'horaire d'arrivée et, si la fiche de police
// n'est pas encore complétée, crée le formulaire si besoin et ajoute son lien dans le même
// message plutôt que d'envoyer deux messages séparés.
export function ArrivalMessageButton({
  reservationId,
  villaId,
  phone,
  guestName,
  checkIn,
  now,
  ficheId,
  ficheComplete,
}: {
  reservationId: string;
  villaId: string;
  phone: string;
  guestName: string;
  checkIn: Date;
  now: Date;
  ficheId: string | null;
  ficheComplete: boolean;
}) {
  const [id, setId] = useState(ficheId);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        let ficheLink: string | null = null;
        if (!ficheComplete) {
          let formId = id;
          if (!formId) {
            const created = await createGendarmerieForm(reservationId, villaId);
            formId = created.id;
            setId(formId);
          }
          ficheLink = `${window.location.origin}/g/${formId}`;
        }
        window.open(toWhatsAppUrl(phone, buildArrivalMessage(guestName, checkIn, now, ficheLink)), "_blank");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      <MessageCircleMore className="h-3.5 w-3.5" />
      Message d&apos;arrivée
    </Button>
  );
}
