"use client";

import { createContext, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

// Permet à un bouton hors de la TabsList (ex. le "fermer" de la carte plein écran) de changer
// d'onglet programmatiquement — un <TabsTrigger> ne peut pas être utilisé hors TabsList (casse
// le RovingFocusGroup de Radix), donc on expose juste la fonction de changement par contexte.
const SetTabContext = createContext<((value: string) => void) | null>(null);

export function useSetPersonnelTab(): (value: string) => void {
  const setTab = useContext(SetTabContext);
  if (!setTab) throw new Error("useSetPersonnelTab doit être utilisé à l'intérieur de PersonnelTabs.");
  return setTab;
}

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
  const [value, setValue] = useState(defaultTab);

  function handleChange(nextValue: string) {
    setValue(nextValue);
    router.replace(`${pathname}?onglet=${nextValue}`, { scroll: false });
  }

  return (
    <SetTabContext.Provider value={handleChange}>
      <Tabs value={value} onValueChange={handleChange}>
        {children}
      </Tabs>
    </SetTabContext.Provider>
  );
}
