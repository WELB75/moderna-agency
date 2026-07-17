import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function domaineColorClass(nom: string): string {
  const key = nom.toLowerCase();
  if (key.includes("moderna 2")) {
    return "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400";
  }
  if (key.includes("zaraba")) {
    return "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400";
  }
  return "";
}

export function DomaineBadge({ nom, className }: { nom: string; className?: string }) {
  const colorClass = domaineColorClass(nom);
  return (
    <Badge variant={colorClass ? "outline" : "secondary"} className={cn(colorClass, className)}>
      {nom}
    </Badge>
  );
}
