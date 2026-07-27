"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

// Onglet mémorisé dans l'URL (?onglet=...) pour qu'un rafraîchissement de page (F5) reste sur
// le même onglet au lieu de revenir sur "Équipe" par défaut.
export function PersonnelTabs({
  defaultTab,
  children,
}: {
  defaultTab: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(value: string) {
    router.replace(`${pathname}?onglet=${value}`, { scroll: false });
  }

  return (
    <Tabs defaultValue={defaultTab} onValueChange={handleChange}>
      {children}
    </Tabs>
  );
}
