"use client";

import { MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildLocationMessage, type MessageLang } from "@/lib/message-templates";

export function LocationMessageButton({
  phone,
  guestName,
  domaineNom,
  mapsUrl,
  wazeUrl = null,
  prominent,
}: {
  phone: string;
  guestName: string;
  domaineNom: string;
  mapsUrl: string;
  wazeUrl?: string | null;
  prominent?: boolean;
}) {
  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildLocationMessage(guestName, domaineNom, mapsUrl, wazeUrl, lang)), "_blank");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={prominent ? "default" : "outline"}
          size={prominent ? "default" : "sm"}
          className={prominent ? "w-full justify-start rounded-xl py-5" : undefined}
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
