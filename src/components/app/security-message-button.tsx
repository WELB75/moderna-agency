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
      className={prominent ? "w-full justify-center rounded-xl py-5" : undefined}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Message sécurité
    </Button>
  );
}
