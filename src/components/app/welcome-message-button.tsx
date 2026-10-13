"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildWelcomeMessage, type MessageLang } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

export function WelcomeMessageButton({
  reservationId,
  phone,
  guestName,
  villaNom,
  mapsUrl,
  wazeUrl,
  codeBoitier,
  guideBienvenueUrl,
  repasInclus = false,
  prominent,
  envoyeAt,
}: {
  reservationId: string;
  phone: string | null;
  guestName: string;
  villaNom: string;
  mapsUrl: string | null;
  wazeUrl: string | null;
  codeBoitier: string | null;
  guideBienvenueUrl: string | null;
  repasInclus?: boolean;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));

  function handleClick(lang: MessageLang) {
    const message = buildWelcomeMessage(guestName, villaNom, mapsUrl, wazeUrl, codeBoitier, guideBienvenueUrl, lang, repasInclus);
    if (phone) {
      window.open(toWhatsAppUrl(phone, message), "_blank");
    } else {
      // Sans numéro (ex. résa Airbnb importée par iCal) : on copie le message pour la conversation Airbnb.
      navigator.clipboard
        .writeText(message)
        .then(() => toast.success("Message copié : colle-le dans la conversation Airbnb."))
        .catch(() => toast.error("Impossible de copier le message."));
    }
    setEnvoye(true);
    marquerMessageEnvoye(reservationId, "bienvenue").catch(() => {});
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={prominent ? "default" : "sm"}
          className={cn(
            prominent && "w-full justify-start rounded-xl border-primary/30 py-5 text-primary hover:bg-primary/5",
            envoye && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
          )}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Message de bienvenue</span> : "Message de bienvenue"}
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
