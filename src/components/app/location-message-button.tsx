import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildLocationMessage } from "@/lib/message-templates";

export function LocationMessageButton({
  phone,
  guestName,
  domaineNom,
  mapsUrl,
}: {
  phone: string;
  guestName: string;
  domaineNom: string;
  mapsUrl: string;
}) {
  const message = buildLocationMessage(guestName, domaineNom, mapsUrl);
  return (
    <Button asChild variant="outline" size="sm">
      <a href={toWhatsAppUrl(phone, message)} target="_blank" rel="noreferrer">
        <MapPin className="h-3.5 w-3.5" />
        Localisation
      </a>
    </Button>
  );
}
