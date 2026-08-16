"use client";

import { MessageCircle } from "lucide-react";
import { toWhatsAppUrl } from "@/lib/phone";

// Icône WhatsApp à côté du nom du client, sur une carte de réservation par ailleurs rendue côté
// serveur (ReservationRowCard) — "use client" isolé ici, un composant serveur ne peut pas passer
// de onClick directement à un <button>. stopPropagation/preventDefault car ce bouton est imbriqué
// dans le <Link> cliquable de toute la carte (navigation vers la fiche villa).
export function GuestWhatsAppButton({ phone, guestName }: { phone: string; guestName: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(toWhatsAppUrl(phone), "_blank");
      }}
      className="shrink-0 rounded-full p-1 text-emerald-600 hover:bg-muted dark:text-emerald-400"
      aria-label={`Contacter ${guestName} sur WhatsApp`}
      title={phone}
    >
      <MessageCircle className="h-3.5 w-3.5" />
    </button>
  );
}
