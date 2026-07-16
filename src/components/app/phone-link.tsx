import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toWhatsAppUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function PhoneLink({ phone, className }: { phone: string; className?: string }) {
  return (
    <Badge asChild variant="outline" className={cn("cursor-pointer", className)}>
      <a href={toWhatsAppUrl(phone)} target="_blank" rel="noreferrer">
        <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        {phone}
      </a>
    </Badge>
  );
}
