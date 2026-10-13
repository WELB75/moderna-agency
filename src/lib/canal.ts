import type { CSSProperties } from "react";

// Canal (source) d'une réservation, normalisé — bascule SuperHote → Beds24 du 2026-10-13. Beds24
// écrit "Airbnb" | "Booking.com" | "Direct" (voir mapCanal dans beds24/sync.ts), mais les lignes
// plus anciennes (import SuperHote, iCal, saisie manuelle) contiennent d'autres valeurs :
// "airbnb", "Airbnb.com", "booking", "Superhote", "Manuel", null... Toute l'app (calendrier,
// listes, boîte de réception) passe par normaliseCanal pour colorer une réservation de la même
// façon partout, façon SuperHote v2 : Airbnb = corail, Booking.com = bleu nuit, Direct = vert.
export type CanalKey = "airbnb" | "booking" | "direct" | "autre";

// Source d'une conversation dans la boîte de réception : un canal de réservation, ou WhatsApp.
export type SourceKey = CanalKey | "whatsapp";

// Valeurs qui désignent une réservation prise en direct par l'agence (pas via une OTA) :
// "Superhote" = résa créée à la main dans SuperHote, "Beds24 booking page" = moteur de résa Beds24.
const DIRECT_HINTS = ["direct", "manuel", "manual", "superhote", "super hote", "beds24", "whatsapp", "site", "agence", "moderna", "telephone", "téléphone"];

export function normaliseCanal(value: string | null | undefined): CanalKey {
  const v = (value ?? "").trim().toLowerCase();
  // Pas de canal renseigné : l'app crée ses réservations manuelles en "Direct" par défaut (voir
  // actions/reservations.ts), la boîte de réception traitait déjà null comme "Direct".
  if (!v) return "direct";
  if (v.includes("airbnb")) return "airbnb";
  // "booking", "Booking.com", "bookingcom"... mais pas "Beds24 booking page" (résa directe).
  if (v.startsWith("booking") || v.includes("booking.com")) return "booking";
  if (DIRECT_HINTS.some((hint) => v.includes(hint))) return "direct";
  return "autre"; // Vrbo, Expedia... : libellé Beds24 gardé tel quel en base
}

export const SOURCE_META: Record<SourceKey, { label: string; letter: string; brand: string; cssVar: string }> = {
  // brand : couleur fixe de la pastille (identique en clair et en sombre, comme un logo).
  // cssVar : teinte adaptée au thème (voir --canal-* dans globals.css) pour barres et pilules.
  airbnb: { label: "Airbnb", letter: "A", brand: "#FF5A5F", cssVar: "var(--canal-airbnb)" },
  booking: { label: "Booking.com", letter: "B", brand: "#003580", cssVar: "var(--canal-booking)" },
  direct: { label: "En direct", letter: "D", brand: "#059669", cssVar: "var(--canal-direct)" },
  autre: { label: "Autre", letter: "?", brand: "#64748b", cssVar: "var(--canal-autre)" },
  whatsapp: { label: "WhatsApp", letter: "W", brand: "#25D366", cssVar: "var(--canal-whatsapp)" },
};

// Libellé affiché : pour "autre", on garde la valeur brute (ex. "Vrbo") plutôt que "Autre".
export function canalLabel(value: string | null | undefined): string {
  const key = normaliseCanal(value);
  if (key === "autre" && value?.trim()) return value.trim();
  return SOURCE_META[key].label;
}

// Barre de réservation façon SuperHote : fond clair teinté (opaque, mélangé à la couleur de carte
// du thème courant pour ne pas laisser transparaître les prix/hachures dessous), liseré fin et
// accent à gauche dans la couleur du canal. À combiner avec la classe "border-l-4" (ou similaire)
// pour que borderLeftColor soit visible.
export function canalBarStyle(key: SourceKey, intensity = 16): CSSProperties {
  const c = SOURCE_META[key].cssVar;
  return {
    backgroundColor: `color-mix(in srgb, ${c} ${intensity}%, var(--card))`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 45%, transparent)`,
    borderLeftColor: c,
  };
}

// Pilule "logo + libellé" (listes, cartes) : fond très léger, texte dans la couleur du canal
// assombrie (thème clair) ou éclaircie (thème sombre) via le mélange avec --foreground.
export function canalPillStyle(key: SourceKey): CSSProperties {
  const c = SOURCE_META[key].cssVar;
  return {
    backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`,
    color: `color-mix(in srgb, ${c} 78%, var(--foreground))`,
  };
}

// Barre de réservation de la vue planning, façon SuperHote v2 : fond pastel, liseré et texte dans
// la couleur du canal (variables --bar-* de globals.css, déclinées en mode sombre).
export function canalPlanningStyle(key: CanalKey): CSSProperties {
  return {
    backgroundColor: `var(--bar-${key}-bg)`,
    borderColor: `var(--bar-${key}-border)`,
    color: `var(--bar-${key}-text)`,
  };
}
