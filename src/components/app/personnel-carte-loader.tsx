"use client";

import dynamic from "next/dynamic";
import type { CarteStaff, CarteDomaine } from "@/components/app/personnel-carte";

// Leaflet touche `window` dès le rendu (pas seulement dans un effect) — sans ssr:false, le
// rendu serveur de ce composant plante. `ssr:false` n'est autorisé que depuis un Client
// Component, d'où ce petit fichier séparé de personnel-carte.tsx.
const PersonnelCarte = dynamic(() => import("@/components/app/personnel-carte").then((m) => m.PersonnelCarte), {
  ssr: false,
  loading: () => <div className="flex h-[440px] w-full items-center justify-center rounded-lg border text-sm text-muted-foreground">Chargement de la carte…</div>,
});

export function PersonnelCarteLoader({ staff, domaines }: { staff: CarteStaff[]; domaines: CarteDomaine[] }) {
  return <PersonnelCarte staff={staff} domaines={domaines} />;
}
