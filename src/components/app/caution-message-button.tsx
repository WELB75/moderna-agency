"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cautionDeLaReservationOrigine, type CautionOrigine } from "@/lib/actions/caution-message";
import { MessageLangueButton } from "@/components/app/message-langue-button";
import { buildCautionMessage } from "@/lib/message-templates";
import { originApp } from "@/lib/app-origin";

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
  chercherOrigine = false,
  prominent,
}: {
  reservationId: string;
  phone: string | null;
  guestName: string;
  villaNom: string;
  beds24BookingId: string | null;
  montant: number | null;
  devise: string;
  // Prolongation en direct : la caution est sur la réservation d'origine, à retrouver.
  chercherOrigine?: boolean;
  prominent?: boolean;
}) {
  const [origine, setOrigine] = useState<CautionOrigine | null>(null);
  useEffect(() => {
    if (!chercherOrigine) return;
    let annule = false;
    cautionDeLaReservationOrigine(reservationId)
      .then((o) => {
        if (!annule) setOrigine(o);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [chercherOrigine, reservationId]);

  const numero = beds24BookingId ?? origine?.beds24BookingId ?? null;
  if (!numero) return null;
  const montantFinal = beds24BookingId ? montant : origine?.montant ?? null;
  const deviseFinale = beds24BookingId ? devise : origine?.devise ?? "EUR";
  const montantEuros = deviseFinale.trim().toUpperCase() === "EUR" ? montantFinal : null;
  return (
    <MessageLangueButton
      reservationId={reservationId}
      phone={phone}
      icon={ShieldCheck}
      label="Message de caution"
      build={(lang) =>
        buildCautionMessage(guestName, villaNom, montantEuros, `${originApp()}/caution/${encodeURIComponent(numero)}`, lang)
      }
      prominent={prominent}
      copieToast="Message de caution copié : colle-le dans la conversation de la plateforme."
    />
  );
}
