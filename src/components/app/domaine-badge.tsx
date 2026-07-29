import { Badge } from "@/components/ui/badge";

export function DomaineBadge({ nom, className }: { nom: string; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {nom}
    </Badge>
  );
}
