"use client";

import { Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildWelcomeMessage, type MessageLang } from "@/lib/message-templates";

export function WelcomeMessageButton({
  phone,
  guestName,
  villaNom,
  mapsUrl,
  wazeUrl,
  codeBoitier,
  guideBienvenueUrl,
  repasInclus = false,
  prominent,
}: {
  phone: string;
  guestName: string;
  villaNom: string;
  mapsUrl: string | null;
  wazeUrl: string | null;
  codeBoitier: string | null;
  guideBienvenueUrl: string | null;
  repasInclus?: boolean;
  prominent?: boolean;
}) {
  function handleClick(lang: MessageLang) {
    window.open(
      toWhatsAppUrl(phone, buildWelcomeMessage(guestName, villaNom, mapsUrl, wazeUrl, codeBoitier, guideBienvenueUrl, lang, repasInclus)),
      "_blank"
    );
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
