"use client";

import { ShieldCheck } from "lucide-react";
import { MessageLangueButton } from "@/components/app/message-langue-button";
import { buildCautionMessage } from "@/lib/message-templates";

// Envoie au voyageur (WhatsApp, ou copie pour la plateforme) le message de caution avec son vrai
// lien de caution, https://<domaine de l'app>/caution/<n° Beds24>. Langue automatique d'après ses
// messages (voir MessageLangueButton). À n'afficher que si la caution n'est pas encore reçue.
export function CautionMessageButton({
  reservationId,
  phone,
  guestName,
  villaNom,
  beds24BookingId,
  montant,
  devise,
  prominent,
}: {
  reservationId: string;
  phone: string | null;
  guestName: string;
  villaNom: string;
  beds24BookingId: string;
  montant: number | null;
  devise: string;
  prominent?: boolean;
}) {
  const montantEuros = devise.trim().toUpperCase() === "EUR" ? montant : null;
  return (
    <MessageLangueButton
      reservationId={reservationId}
      phone={phone}
      icon={ShieldCheck}
      label="Message de caution"
      build={(lang) =>
        buildCautionMessage(guestName, villaNom, montantEuros, `${window.location.origin}/caution/${encodeURIComponent(beds24BookingId)}`, lang)
      }
      prominent={prominent}
      copieToast="Message de caution copié : colle-le dans la conversation de la plateforme."
    />
  );
}
