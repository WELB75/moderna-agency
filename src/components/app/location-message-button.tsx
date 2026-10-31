"use client";

import { MapPin } from "lucide-react";
import { MessageLangueButton } from "@/components/app/message-langue-button";
import { buildLocationMessage } from "@/lib/message-templates";

// Langue automatique d'après les messages du voyageur (voir MessageLangueButton).
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
  phone: string | null;
  guestName: string;
  domaineNom: string;
  mapsUrl: string;
  wazeUrl?: string | null;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  return (
    <MessageLangueButton
      reservationId={reservationId}
      phone={phone}
      icon={MapPin}
      label="Localisation"
      type="localisation"
      build={(lang) => buildLocationMessage(guestName, domaineNom, mapsUrl, wazeUrl, lang)}
      prominent={prominent}
      envoyeAt={envoyeAt}
    />
  );
}
