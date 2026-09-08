"use client";

import { DoorOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildCheckoutMessage, type MessageLang } from "@/lib/message-templates";

// Distinct du "Message de départ" existant (buildDepartureMessage, envoyé APRÈS que le client
// soit parti) : celui-ci s'envoie le matin même du départ, avec la procédure de checkout.
export function CheckoutMessageButton({
  phone,
  guestName,
  villaNom,
  prominent,
}: {
  phone: string;
  guestName: string;
  villaNom: string;
  prominent?: boolean;
}) {
  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildCheckoutMessage(guestName, villaNom, lang)), "_blank");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={prominent ? "default" : "sm"}
          className={prominent ? "w-full justify-start rounded-xl border-primary/30 py-5 text-primary hover:bg-primary/5" : undefined}
        >
          <DoorOpen className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Instructions départ</span> : "Instructions départ"}
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
