"use client";

import dynamic from "next/dynamic";
import type { MapStaffPoint, MapDomainePoint } from "@/components/app/personnel-map";

// Leaflet touche `window` dès le rendu (pas seulement dans un effect) — sans ssr:false, le
// rendu serveur de ce composant plante. `ssr:false` n'est autorisé que depuis un Client
// Component, d'où ce petit fichier séparé de personnel-map.tsx.
const PersonnelMap = dynamic(() => import("@/components/app/personnel-map").then((m) => m.PersonnelMap), {
  ssr: false,
  loading: () => <div className="flex h-[420px] w-full items-center justify-center rounded-lg border text-sm text-muted-foreground">Chargement de la carte…</div>,
});

export function PersonnelMapLoader({ staff, domaines }: { staff: MapStaffPoint[]; domaines: MapDomainePoint[] }) {
  return <PersonnelMap staff={staff} domaines={domaines} />;
}
