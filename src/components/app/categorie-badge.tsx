import { Badge } from "@/components/ui/badge";
import { CategorieIcon } from "@/components/app/categorie-icon";
import { categorieLabel, type Categorie } from "@/lib/intervention-categorie";
import { cn } from "@/lib/utils";

export function CategorieBadge({ categorie, className }: { categorie: Categorie; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs text-muted-foreground", className)}>
      <CategorieIcon categorie={categorie} className="h-3 w-3" />
      {categorieLabel(categorie)}
    </Badge>
  );
}
