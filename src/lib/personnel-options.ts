import { isNotNull } from "drizzle-orm";
import { distanceKm } from "@/lib/geo";
import { personnelAffectations } from "@/db/schema";
import type { getDb } from "@/db";

export type PersonnelOption = {
  id: string;
  nom: string;
  notes?: string | null;
  distanceKm?: number | null;
  qualiteMoyenne?: number | null;
  qualiteTotal?: number;
};

export type QualiteMoyenneById = Map<string, { moyenne: number; total: number }>;

// Moyenne long terme de la note qualité (1-5, voir QualiteNoteControl dans
// personnel-affectation-editor.tsx), calculée une fois pour l'injecter dans le menu de choix
// ménage/cuisine — repérer aussi les personnes les mieux notées, pas seulement les plus proches.
// Kamel, 2026-09-04 : "je vois pas la note sur 5" (dans le menu déroulant, à côté du km).
export async function getQualiteMoyenneById(db: ReturnType<typeof getDb>): Promise<QualiteMoyenneById> {
  const rows = await db
    .select({ personnelId: personnelAffectations.personnelId, qualiteNote: personnelAffectations.qualiteNote })
    .from(personnelAffectations)
    .where(isNotNull(personnelAffectations.qualiteNote));
  const sommeById = new Map<string, { somme: number; total: number }>();
  for (const r of rows) {
    if (r.qualiteNote === null) continue;
    const current = sommeById.get(r.personnelId) ?? { somme: 0, total: 0 };
    current.somme += r.qualiteNote;
    current.total += 1;
    sommeById.set(r.personnelId, current);
  }
  const result: QualiteMoyenneById = new Map();
  for (const [id, { somme, total }] of sommeById) result.set(id, { moyenne: somme / total, total });
  return result;
}

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
  domaine: DomaineCoords,
  qualiteById?: QualiteMoyenneById
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
      const qualite = qualiteById?.get(p.id) ?? null;
      return {
        id: p.id,
        nom: p.nom,
        notes: p.notes,
        distanceKm: km,
        qualiteMoyenne: qualite?.moyenne ?? null,
        qualiteTotal: qualite?.total ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.nom.localeCompare(b.nom);
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}
