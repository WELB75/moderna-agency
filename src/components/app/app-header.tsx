"use client";

import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { GlobalSearchOverlay } from "@/components/app/global-search-overlay";

// En-tête façon SuperHote v2 : barre de recherche globale (⌘K) à gauche, actions à droite
// (chaque page garde son propre titre juste en dessous). Sur téléphone : logo + recherche + compte (le menu latéral, qui
// porte la carte du compte sur ordinateur, y est masqué).
export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 print:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex shrink-0 items-center gap-2 md:hidden">
        <Logo size={28} />
      </div>
      <div className="flex min-w-0 flex-1 justify-end md:justify-start">
        <GlobalSearchOverlay variant="bar" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <div className="md:hidden">
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </div>
      </div>
    </header>
  );
}
