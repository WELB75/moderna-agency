"use client";

import { useState } from "react";
import { ShoppingBasket, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildCuisineCoursesMessage, type MessageLang } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

export function CuisineCoursesMessageButton({
  reservationId,
  phone,
  guestName,
  prominent,
  envoyeAt,
}: {
  reservationId: string;
  phone: string;
  guestName: string;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));

  function handleClick(lang: MessageLang) {
    window.open(toWhatsAppUrl(phone, buildCuisineCoursesMessage(guestName, lang)), "_blank");
    setEnvoye(true);
    marquerMessageEnvoye(reservationId, "cuisine").catch(() => {});
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
          <ShoppingBasket className="h-3.5 w-3.5 shrink-0" />
          {prominent ? <span className="flex-1 text-center">Message courses</span> : "Message courses"}
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
