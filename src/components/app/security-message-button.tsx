"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildSecurityMessage } from "@/lib/message-templates";

export function SecurityMessageButton({
  securityPhone,
  guestName,
  villaNom,
  villaNumero,
  villaId,
  checkIn,
  prominent,
}: {
  securityPhone: string;
  guestName: string;
  villaNom: string;
  villaNumero: string;
  villaId: string;
  checkIn: Date;
  prominent?: boolean;
}) {
  function handleClick() {
    const link = `${window.location.origin}/securite/villa/${villaId}`;
    const message = buildSecurityMessage(guestName, villaNom, villaNumero, link, checkIn);
    window.open(toWhatsAppUrl(securityPhone, message), "_blank");
  }

  return (
    <Button
      type="button"
      variant={prominent ? "default" : "outline"}
      size={prominent ? "default" : "sm"}
      onClick={handleClick}
      className={prominent ? "w-full justify-start rounded-xl py-5" : undefined}
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
