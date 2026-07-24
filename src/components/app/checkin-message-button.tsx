import { MessageCircleMore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toWhatsAppUrl } from "@/lib/phone";
import { buildCheckinReminderMessage } from "@/lib/message-templates";

export function CheckinMessageButton({
  phone,
  guestName,
  checkIn,
  now,
}: {
  phone: string;
  guestName: string;
  checkIn: Date;
  now: Date;
}) {
  const message = buildCheckinReminderMessage(guestName, checkIn, now);
  return (
    <Button asChild variant="outline" size="sm">
      <a href={toWhatsAppUrl(phone, message)} target="_blank" rel="noreferrer">
        <MessageCircleMore className="h-3.5 w-3.5" />
        Message d&apos;arrivée
      </a>
    </Button>
  );
}
