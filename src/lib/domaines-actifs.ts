// Phase de test : on ne travaille que sur le Domaine Moderna II. Domaine Zaraba et Noria
// sont mis de côté (pas supprimés, juste masqués de l'interface) — voir demande du 2026-07-24.
export const DOMAINES_MASQUES = ["Domaine Zaraba", "Noria"];

export function domaineEstActif(nom: string | null | undefined): boolean {
  return !DOMAINES_MASQUES.includes(nom ?? "");
}

export function filtrerDomainesActifs<T extends { nom: string }>(domaines: T[]): T[] {
  return domaines.filter((d) => domaineEstActif(d.nom));
}

export function idsDomainesActifs(domaines: { id: string; nom: string }[]): Set<string> {
  return new Set(filtrerDomainesActifs(domaines).map((d) => d.id));
}

export function idsVillasActives(
  villas: { id: string; domaineId: string | null }[],
  domaineIdsActifs: Set<string>
): Set<string> {
  return new Set(villas.filter((v) => v.domaineId && domaineIdsActifs.has(v.domaineId)).map((v) => v.id));
}
