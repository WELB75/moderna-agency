"use client";

import { useState, useTransition } from "react";
import { MessageCircleMore, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createGendarmerieForm } from "@/lib/actions/gendarmerie";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildArrivalMessage, type MessageLang } from "@/lib/message-templates";

// Un seul message, un seul bouton : demande l'horaire d'arrivée et, si la fiche de police
// n'est pas encore complétée, crée le formulaire si besoin et ajoute son lien dans le même
// message plutôt que d'envoyer deux messages séparés. Choix de langue (FR/EN) en un clic sur
// la flèche, pour les clients non-francophones.
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

  function handleClick(lang: MessageLang) {
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
        window.open(toWhatsAppUrl(phone, buildArrivalMessage(guestName, checkIn, now, ficheLink, lang)), "_blank");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isPending}>
          <MessageCircleMore className="h-3.5 w-3.5" />
          Message d&apos;arrivée
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleClick("fr")}>Français</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleClick("en")}>English</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
