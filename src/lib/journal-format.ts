// Affichage du journal des réservations (voir src/lib/journal.ts) — sans dépendance serveur,
// utilisable aussi dans les composants client (popup du calendrier).

// Instant réel (created_at) affiché à l'heure du Maroc, ex. "16 oct. 2026 à 11:37".
export function formatHeureMaroc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const jour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Casablanca",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${jour} à ${heure}`;
}

export const LIBELLES_ACTION: Record<string, string> = {
  creation: "Ajout",
  suppression: "Suppression (dates rouvertes)",
  annulation: "Annulation",
  modification_heures: "Changement d'heure",
  fermeture_beds24: "Nouvelle fermeture Beds24",
};

export const LIBELLES_BEDS24: Record<string, string> = {
  ok: "Beds24 OK",
  echec: "Beds24 en échec",
  non_concerne: "Beds24 non concerné",
};
