"use client";

import { ShoppingBasket } from "lucide-react";
import { MessageLangueButton } from "@/components/app/message-langue-button";
import { buildCuisineCoursesMessage } from "@/lib/message-templates";

// Langue automatique d'après les messages du voyageur (voir MessageLangueButton).
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
  return (
    <MessageLangueButton
      reservationId={reservationId}
      phone={phone}
      icon={ShoppingBasket}
      label="Message courses"
      type="cuisine"
      build={(lang) => buildCuisineCoursesMessage(guestName, lang)}
      prominent={prominent}
      envoyeAt={envoyeAt}
    />
  );
}
