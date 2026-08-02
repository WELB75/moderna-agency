import Link from "next/link";
import { navItems } from "@/components/app/nav-items";

// Grille de raccourcis en haut de l'accueil (inspirée du menu Uber : tuiles nettes, sobres,
// une par section) — pour atteindre une section en un tap au lieu de passer par le menu latéral,
// surtout utile au pouce sur téléphone. "Accueil" est exclu, on y est déjà.
export function MenuGrid({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const items = navItems.filter((item) => item.href !== "/dashboard");

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon;
        const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex aspect-square flex-col items-start justify-between border border-border bg-muted/40 p-4 transition-colors hover:bg-muted"
          >
            {badgeCount > 0 ? (
              <span className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {badgeCount}
              </span>
            ) : null}
            <Icon className="h-6 w-6 shrink-0" />
            <span className="text-sm font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
