"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavItemActive } from "@/components/app/nav-items";
import { Logo } from "@/components/app/logo";

// Verre dépoli clair, cohérent avec le reste de l'app (Card, ReservationRowCard) — jamais de
// noir/gris plein comme surface de nav, même recette partout (translucide + flou + saturation)
// pour une vraie continuité visuelle. Kamel, 2026-08-17 : "je veux pas de noir ou gris fait
// vraiment un truc liquid glass, donc continuité partout".
export function SidebarNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-white/45 text-foreground shadow-[8px_0_30px_rgba(0,0,0,0.06)] ring-1 ring-white/60 backdrop-blur-2xl backdrop-saturate-150 md:flex print:hidden dark:bg-white/8 dark:ring-white/10">
      <div className="flex flex-col items-center border-b border-white/50 px-5 py-8 dark:border-white/10">
        <div className="rounded-full bg-white/80 p-1.5 shadow-sm">
          <Logo size={72} />
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const active = isNavItemActive(pathname, searchParams, item.href);
          const Icon = item.icon;
          const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-light uppercase tracking-[0.12em] transition-colors",
                active
                  ? "bg-white/80 text-foreground shadow-sm ring-1 ring-white/60"
                  : "text-foreground/60 hover:bg-white/40 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {item.label}
              {badgeCount > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[11px] font-semibold normal-case tracking-normal text-white">
                  {badgeCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
