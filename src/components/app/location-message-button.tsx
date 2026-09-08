"use client";

import { useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildLocationMessage, type MessageLang } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

export function LocationMessageButton({
  reservationId,
  phone,
  guestName,
  domaineNom,
  mapsUrl,
  wazeUrl = null,
  prominent,
  envoyeAt,
}: {
  reservationId: string;
  phone: string;
  guestName: string;
  domaineNom: string;
  mapsUrl: string;
  wazeUrl?: string | null;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));

  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildLocationMessage(guestName, domaineNom, mapsUrl, wazeUrl, lang)), "_blank");
    setEnvoye(true);
    marquerMessageEnvoye(reservationId, "localisation").catch(() => {});
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
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Localisation</span> : "Localisation"}
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
