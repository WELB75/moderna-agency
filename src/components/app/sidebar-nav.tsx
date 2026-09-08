"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems, isNavItemActive } from "@/components/app/nav-items";
import { Logo } from "@/components/app/logo";

// Sidebar plate façon Stripe Dashboard (docs.stripe.com/stripe-apps/components) : fond uni,
// bordure fine, libellés en casse normale, ligne active en fond teinté léger — plus de verre
// dépoli/flou ni de majuscules espacées (ancien habillage "liquid glass", 2026-08-17). Kamel,
// 2026-09-08 : "developpe vraiment a fond comme stripe [...] et aussi l'interface utilisateur
// faut le faire".
export function SidebarNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex print:hidden">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <Logo size={32} />
        <span className="text-sm font-semibold">Moderna Agency</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navItems.map((item) => {
          const active = isNavItemActive(pathname, searchParams, item.href);
          const Icon = item.icon;
          const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.85rem] transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{item.label}</span>
              {badgeCount > 0 ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
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
