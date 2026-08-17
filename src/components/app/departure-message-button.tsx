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

export function DepartureMessageButton({
  phone,
  guestName,
  prominent,
}: {
  phone: string;
  guestName: string;
  prominent?: boolean;
}) {
  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildDepartureMessage(guestName, lang)), "_blank");
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
          <HeartHandshake className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Message de départ</span> : "Message de départ"}
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
