"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

// Kamel, 2026-09-04 : "ajoute le mode sombre" — les variables --background/--card etc. sombres
// existaient déjà dans globals.css (.dark) mais rien ne posait jamais la classe .dark, donc le
// mode sombre était inactivable. next-themes s'en charge et respecte la préférence système par
// défaut. resolvedTheme est indéterminé côté serveur : useSyncExternalStore (plutôt qu'un effet +
// setState) détecte le montage client sans déclencher de rendu en cascade.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      title={isDark ? "Mode clair" : "Mode sombre"}
      disabled={!mounted}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
