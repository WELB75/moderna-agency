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
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildArrivalMessage, type MessageLang } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

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
  repasInclus = false,
  prominent,
  envoyeAt,
}: {
  reservationId: string;
  villaId: string;
  phone: string;
  guestName: string;
  checkIn: Date;
  now: Date;
  ficheId: string | null;
  ficheComplete: boolean;
  repasInclus?: boolean;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [id, setId] = useState(ficheId);
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));
  const [isPending, startTransition] = useTransition();

  function handleClick(lang: MessageLang) {
    // La fenêtre doit s'ouvrir de façon synchrone, dans le prolongement direct du clic —
    // sinon les navigateurs (Safari en particulier) ne la reconnaissent plus comme une
    // action utilisateur légitime et bloquent le passage vers l'app WhatsApp, laissant une
    // page vide bloquée sur l'écran de chargement WhatsApp. On ouvre donc un onglet vide
    // tout de suite, et on le redirige une fois le lien de fiche (éventuellement créé) prêt.
    const win = window.open("", "_blank");
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
        const url = toWhatsAppUrl(phone, buildArrivalMessage(guestName, checkIn, now, ficheLink, lang, repasInclus));
        if (win) win.location.href = url;
        else window.open(url, "_blank");
        setEnvoye(true);
        marquerMessageEnvoye(reservationId, "arrivee").catch(() => {});
      } catch (err) {
        win?.close();
        toast.error(err instanceof Error ? err.message : "Erreur.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={prominent ? "default" : "sm"}
          disabled={isPending}
          className={cn(
            prominent && "w-full justify-start rounded-xl border-primary/30 py-5 text-primary hover:bg-primary/5",
            envoye && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          )}
        >
          <MessageCircleMore className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Message d&apos;arrivée</span> : "Message d'arrivée"}
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => handleClick("fr")}>Français</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleClick("en")}>English</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
