import { distanceKm } from "@/lib/geo";

export type PersonnelOption = {
  id: string;
  nom: string;
  notes?: string | null;
  distanceKm?: number | null;
};

type PersonnelRow = {
  id: string;
  nom: string;
  role: string;
  actif: boolean;
  notes: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
};

type DomaineCoords = { latitude: string | number | null; longitude: string | number | null } | null | undefined;

// Trie les options par proximité du domaine concerné (distance à vol d'oiseau depuis la dernière
// position connue de la personne, voir personnel.latitude/longitude dans db/schema.ts) : aide à
// repérer la femme de ménage la plus proche plutôt que de dérouler une liste alphabétique à
// l'aveugle. Sans position connue (ou si le domaine n'a pas de coordonnées), la personne reste
// disponible mais retombe en fin de liste, triée par nom. Kamel, 2026-09-03.
export function buildPersonnelOptions(
  personnelList: PersonnelRow[],
  role: "menage" | "cuisine",
  domaine: DomaineCoords
): PersonnelOption[] {
  const domaineLat = domaine?.latitude != null ? Number(domaine.latitude) : null;
  const domaineLng = domaine?.longitude != null ? Number(domaine.longitude) : null;

  return personnelList
    .filter((p) => p.actif && p.role === role)
    .map((p) => {
      const lat = p.latitude != null ? Number(p.latitude) : null;
      const lng = p.longitude != null ? Number(p.longitude) : null;
      const km =
        lat !== null && lng !== null && domaineLat !== null && domaineLng !== null
          ? distanceKm(lat, lng, domaineLat, domaineLng)
          : null;
      return { id: p.id, nom: p.nom, notes: p.notes, distanceKm: km };
    })
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.nom.localeCompare(b.nom);
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}
