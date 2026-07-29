import Link from "next/link";
import { navItems } from "@/components/app/nav-items";

// Grille de raccourcis en haut de l'accueil (inspirée du menu Uber : tuiles nettes, sobres,
// une par section) — pour atteindre une section en un tap au lieu de passer par le menu latéral,
// surtout utile au pouce sur téléphone. "Accueil" est exclu, on y est déjà.
export function MenuGrid() {
  const items = navItems.filter((item) => item.href !== "/dashboard");

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-start justify-between gap-3 border border-border bg-muted/40 p-3 transition-colors hover:bg-muted"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
