"use client";

import { HeartHandshake, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildDepartureMessage, type MessageLang } from "@/lib/message-templates";

export function DepartureMessageButton({ phone, guestName }: { phone: string; guestName: string }) {
  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildDepartureMessage(guestName, lang)), "_blank");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <HeartHandshake className="h-3.5 w-3.5" />
          Message de départ
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
