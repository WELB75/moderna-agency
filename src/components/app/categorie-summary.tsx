import { CategorieIcon } from "@/components/app/categorie-icon";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";

export function CategorieSummary({ items }: { items: { categorie: Categorie; etape: string }[] }) {
  const counts = new Map<Categorie, number>();
  for (const item of items) {
    if (item.etape === "termine") continue;
    counts.set(item.categorie, (counts.get(item.categorie) ?? 0) + 1);
  }

  const present = CATEGORIES.filter((c) => (counts.get(c.key) ?? 0) > 0);
  if (present.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {present.map((c) => (
        <div key={c.key} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm">
          <CategorieIcon categorie={c.key} className="h-4 w-4 text-muted-foreground" />
          <span>{c.label}</span>
          <span className="ml-0.5 text-muted-foreground">{counts.get(c.key)}</span>
        </div>
      ))}
    </div>
  );
}
