export type CategorieStats = {
  total: number;
  aTraiter: number;
  enCours: number;
  terminees: number;
};

// Calcule le résumé (total / à traiter / en cours / terminées) à partir d'une liste
// d'interventions — "à traiter" regroupe tout ce qui n'est ni en cours ni terminé
// (signalé, contacté, planifié).
export function computeCategorieStats(list: { etape: string }[]): CategorieStats {
  const total = list.length;
  const terminees = list.filter((i) => i.etape === "termine").length;
  const enCours = list.filter((i) => i.etape === "en_cours").length;
  return { total, aTraiter: total - terminees - enCours, enCours, terminees };
}
