"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { marquerMessageEnvoye } from "@/lib/actions/reservations";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildSecurityMessage } from "@/lib/message-templates";
import { cn } from "@/lib/utils";

export function SecurityMessageButton({
  securityPhone,
  guestName,
  villaNom,
  villaNumero,
  reservationId,
  checkIn,
  prominent,
  envoyeAt,
}: {
  securityPhone: string;
  guestName: string;
  villaNom: string;
  villaNumero: string;
  reservationId: string;
  checkIn: Date;
  prominent?: boolean;
  envoyeAt?: Date | null;
}) {
  const [envoye, setEnvoye] = useState(Boolean(envoyeAt));

  function handleClick() {
    // Lien propre à cette réservation (pas un lien permanent par villa) : un ancien lien ne
    // doit jamais pouvoir montrer les occupants d'un séjour suivant — Kamel, 2026-08-20.
    const link = `${window.location.origin}/securite/villa/${reservationId}`;
    const message = buildSecurityMessage(guestName, villaNom, villaNumero, link, checkIn);
    window.open(toWhatsAppUrl(securityPhone, message), "_blank");
    setEnvoye(true);
    marquerMessageEnvoye(reservationId, "securite").catch(() => {});
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={prominent ? "default" : "sm"}
      onClick={handleClick}
      className={cn(
        prominent && "w-full justify-start rounded-xl border-primary/30 py-5 text-primary hover:bg-primary/5",
        envoye && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      {prominent ? (
        <>
          <span className="flex-1 text-center">Message sécurité</span>
          {/* Espace invisible de la même taille que le chevron des autres boutons empilés, pour
              que l'icône reste alignée avec eux malgré l'absence de menu déroulant ici (Kamel,
              2026-08-17 : "je veux que tous les icones soit superposé parallèlement"). */}
          <span className="h-3 w-3 shrink-0" aria-hidden />
        </>
      ) : (
        "Message sécurité"
      )}
    </Button>
  );
}
