"use client";

import { useSyncExternalStore } from "react";

// Vrai sous le point de rupture "md" de Tailwind (768px) : téléphone et petite tablette.
// Rendu serveur = faux (ordinateur) ; le navigateur corrige juste après l'hydratation.
function subscribe(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useEstMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
