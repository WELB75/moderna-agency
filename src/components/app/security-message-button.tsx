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
}: {
  securityPhone: string;
  guestName: string;
  villaNom: string;
  villaNumero: string;
  villaId: string;
  checkIn: Date;
}) {
  function handleClick() {
    const link = `${window.location.origin}/securite/villa/${villaId}`;
    const message = buildSecurityMessage(guestName, villaNom, villaNumero, link, checkIn);
    window.open(toWhatsAppUrl(securityPhone, message), "_blank");
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      <ShieldCheck className="h-3.5 w-3.5" />
      Message sécurité
    </Button>
  );
}
