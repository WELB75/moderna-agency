"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navItems } from "@/components/app/nav-items";
import { Logo } from "@/components/app/logo";

export function SidebarNav({ unreadChatCount = 0 }: { unreadChatCount?: number }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-black/55 text-white shadow-[8px_0_30px_rgba(0,0,0,0.15)] backdrop-blur-xl backdrop-saturate-150 md:flex print:hidden">
      <div className="flex flex-col items-center border-b border-white/15 px-5 py-8">
        <div className="rounded-full bg-white p-1.5">
          <Logo size={72} />
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          const badgeCount = item.href === "/chat" ? unreadChatCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-light uppercase tracking-[0.12em] transition-colors",
                active
                  ? "bg-white/90 text-black"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {item.label}
              {badgeCount > 0 ? (
                <span
                  className={cn(
                    "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold normal-case tracking-normal",
                    active ? "bg-black text-white" : "bg-white text-black"
                  )}
                >
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
