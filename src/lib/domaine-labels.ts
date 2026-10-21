// Noms d'affichage des domaines sur le tableau de bord — 2026-10-17 : « Noria, Villa Moderna 1,
// Villa Moderna 2 » plutôt que les noms techniques en base ("Domaine Zaraba", "Domaine Moderna
// II"), qui restent inchangés partout ailleurs (schéma, synchros, filtres). Même esprit que les
// noms d'usage de la carte du personnel (personnel-carte.tsx, "Moderna 1 / Moderna 2").
const DOMAINE_LABELS: Record<string, string> = {
  "Domaine Moderna II": "Villa Moderna 2",
  "Domaine Zaraba": "Villa Moderna 1",
  Noria: "Noria",
};

export function domaineLabel(nom: string | null | undefined): string {
  if (!nom) return "Sans domaine";
  return DOMAINE_LABELS[nom] ?? nom;
}
