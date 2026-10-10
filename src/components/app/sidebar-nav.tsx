"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { navGroups, isNavItemActive } from "@/components/app/nav-items";
import { Logo } from "@/components/app/logo";

const COLLAPSED_KEY = "moderna:sidebar-collapsed";

// Menu latéral façon SuperHote v2 : sections titrées en petites capitales ("Au quotidien",
// "Communication & opérations", "Croissance & outils"), ligne active teintée de la couleur
// d'accent, bouton pour replier le menu en simple colonne d'icônes, et carte du compte connecté
// tout en bas. Couleurs : celles de l'app (violet), pas celles de SuperHote.
export function SidebarNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // stockage indisponible (navigation privée) : menu déplié par défaut
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // sans importance : la préférence ne sera simplement pas retenue
      }
      return next;
    });
  }

  const displayName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Mon compte";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex print:hidden",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className={cn("flex h-14 items-center gap-2 px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <Logo size={28} />
            <span className="truncate text-sm font-semibold tracking-tight">Moderna Agency</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={toggleCollapsed}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4 pt-2">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-0.5">
            {collapsed ? (
              <div className="mx-auto mb-1.5 h-px w-6 bg-sidebar-border" />
            ) : (
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, searchParams, item.href);
              const Icon = item.icon;
              const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md py-1.5 text-[0.85rem] transition-colors",
                    collapsed ? "justify-center px-0" : "px-2.5",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {badgeCount > 0 ? (
                    <span
                      className={cn(
                        "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground",
                        collapsed ? "absolute -right-0.5 -top-1 h-4 min-w-4 text-[9px]" : "ml-auto"
                      )}
                    >
                      {badgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-background p-2",
            collapsed && "justify-center border-transparent bg-transparent p-1"
          )}
        >
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
          {!collapsed ? (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">Espace Moderna Agency</p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
