"use client";

import { Sparkles } from "lucide-react";
import { MessageLangueButton } from "@/components/app/message-langue-button";
import { buildWelcomeMessage } from "@/lib/message-templates";

// Langue automatique d'après les messages du voyageur (voir MessageLangueButton).
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
  return (
    <MessageLangueButton
      reservationId={reservationId}
      phone={phone}
      icon={Sparkles}
      label="Message de bienvenue"
      type="bienvenue"
      build={(lang) => buildWelcomeMessage(guestName, villaNom, mapsUrl, wazeUrl, codeBoitier, guideBienvenueUrl, lang, repasInclus)}
      prominent={prominent}
      envoyeAt={envoyeAt}
      copieToast="Message copié : colle-le dans la conversation Airbnb."
    />
  );
}
