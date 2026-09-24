// Phase de test : on ne travaille que sur le Domaine Moderna II. Domaine Zaraba (= "Moderna 1"
// à l'oral, voir personnel-carte.tsx) a été réactivé le 2026-09-24 — Kamel : "ajoute Moderna 1
// dans les domaines". Noria reste mis de côté (pas supprimé, juste masqué de l'interface) — voir
// demande du 2026-07-24.
export const DOMAINES_MASQUES = ["Noria"];

export function domaineEstActif(nom: string | null | undefined): boolean {
  return !DOMAINES_MASQUES.includes(nom ?? "");
}

// Villas retirées individuellement de la gestion active, contrairement à un domaine entier
// masqué via DOMAINES_MASQUES ci-dessus. N'affecte que le suivi opérationnel au jour le jour
// (plan du domaine, villas libres/occupées, dispatch auto ménage/cuisine) — l'historique (résas,
// factures...) reste visible ailleurs dans l'app, rien n'est supprimé.
// "Villa 5" (même fiche, numéro 5 dans Domaine Moderna II) a été réactivée et renommée
// "Villa Naggy" le 2026-09-17 avec sa vraie synchro Superhote — donc retirée d'ici.
export const VILLAS_MASQUEES: string[] = [];

export function villaEstGeree(nom: string | null | undefined): boolean {
  return !VILLAS_MASQUEES.includes(nom ?? "");
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
