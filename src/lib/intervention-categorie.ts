export type Categorie =
  | "electricite"
  | "plomberie"
  | "climatisation"
  | "carrelage_sol"
  | "mobilier"
  | "vitres_fenetres"
  | "peinture_murs"
  | "exterieur_jardin"
  | "internet_domotique"
  | "proprete"
  | "autre";

export const CATEGORIES: { key: Categorie; label: string }[] = [
  { key: "electricite", label: "Électricité" },
  { key: "plomberie", label: "Plomberie" },
  { key: "climatisation", label: "Climatisation" },
  { key: "carrelage_sol", label: "Carrelage / sol" },
  { key: "mobilier", label: "Mobilier" },
  { key: "vitres_fenetres", label: "Vitres / fenêtres" },
  { key: "peinture_murs", label: "Peinture / murs" },
  { key: "exterieur_jardin", label: "Extérieur / jardin" },
  { key: "internet_domotique", label: "Internet / domotique" },
  { key: "proprete", label: "Propreté" },
  { key: "autre", label: "Autre" },
];

export function categorieLabel(categorie: Categorie): string {
  return CATEGORIES.find((c) => c.key === categorie)?.label ?? "Autre";
}
