"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lienStatistiques, type TypeStats } from "@/lib/logement-stats";

const ONGLETS: { value: TypeStats; label: string }[] = [
  { value: "villa", label: "Villas" },
  { value: "appartement", label: "Appartements" },
  { value: "total", label: "Total" },
];

// Périmètre de toute la page Statistiques (KPI, graphiques, tableau) : villas seules,
// appartements seuls ou tout le portefeuille. Change l'URL, la page se recalcule côté serveur.
export function StatistiquesTypeTabs({ type, year }: { type: TypeStats; year: number }) {
  const router = useRouter();
  return (
    <Tabs value={type} onValueChange={(v) => router.push(lienStatistiques({ annee: year, type: v as TypeStats }))}>
      <TabsList>
        {ONGLETS.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className="px-4">
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
