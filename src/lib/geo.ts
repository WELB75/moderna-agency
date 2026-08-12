// Distance à vol d'oiseau entre deux points GPS (formule de Haversine), en kilomètres.
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Les domaines n'ont pas de colonnes lat/lng dédiées : leurs coordonnées vivent déjà dans
// wazeUrl (ex. "https://waze.com/ul?ll=31.5322245,-7.9281609&navigate=yes"), renseigné pour
// chaque domaine. Plutôt que dupliquer la donnée dans une nouvelle colonne, on la reparse ici.
export function parseWazeCoords(wazeUrl: string | null): { lat: number; lng: number } | null {
  if (!wazeUrl) return null;
  const match = wazeUrl.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
