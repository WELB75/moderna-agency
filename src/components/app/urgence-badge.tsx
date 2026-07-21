import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { urgenceInfo, type Urgence } from "@/lib/intervention-urgence";

export function UrgenceBadge({ urgence, className }: { urgence: Urgence; className?: string }) {
  if (urgence === "normale") return null;
  const info = urgenceInfo(urgence);
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", info.badgeClassName, className)}>
      {urgence === "critique" ? <AlertTriangle className="h-3 w-3" /> : null}
      {info.label}
    </Badge>
  );
}
