"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, isNavItemActive, mobilePrimaryHrefs } from "@/components/app/nav-items";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function BottomNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const primaryItems = mobilePrimaryHrefs
    .map((href) => navItems.find((item) => item.href === href))
    .filter((item): item is (typeof navItems)[number] => Boolean(item));
  const overflowItems = navItems.filter((item) => !mobilePrimaryHrefs.includes(item.href));
  const isOverflowActive = overflowItems.some((item) => isNavItemActive(pathname, searchParams, item.href));
  const overflowHasUnread = unreadChatCount > 0 && overflowItems.some((item) => item.href === "/chat");

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background md:hidden print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex items-stretch justify-around">
          {primaryItems.map((item) => {
            const active = isNavItemActive(pathname, searchParams, item.href);
            const Icon = item.icon;
            const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium leading-none transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5 shrink-0" />
                    {badgeCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground">
                        {badgeCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-full truncate text-center">{item.label}</span>
                </Link>
              </li>
            );
          })}
          {overflowItems.length > 0 && (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium leading-none transition-colors",
                  isOverflowActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  <MoreHorizontal className="h-5 w-5 shrink-0" />
                  {overflowHasUnread ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground">
                      {unreadChatCount}
                    </span>
                  ) : null}
                </span>
                <span className="w-full truncate text-center">Plus</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="md:hidden">
          <SheetHeader>
            <SheetTitle>Plus</SheetTitle>
          </SheetHeader>
          <ul
            className="space-y-1 px-4 pb-6"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
          >
            {overflowItems.map((item) => {
              const active = isNavItemActive(pathname, searchParams, item.href);
              const Icon = item.icon;
              const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    {item.label}
                    {badgeCount > 0 ? (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                        {badgeCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
