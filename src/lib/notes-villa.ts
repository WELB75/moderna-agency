// Catégories des notes de suivi par logement (table villa_notes). Une seule source de vérité pour
// la page Notes de l'app et les outils de l'agent Telegram.
export const CATEGORIES_NOTES = [
  { key: "etat_logement", label: "État du logement", aide: "Propreté, dégâts, équipements, ce qui est cassé ou en bon état." },
  { key: "travaux", label: "Travaux", aide: "Travaux faits, en cours ou à prévoir, qui passe, pièces à acheter." },
  { key: "aleas", label: "Aléas", aide: "Imprévus : panne, fuite, coupure, litige, incident avec un client." },
  { key: "argent", label: "Cautions et argent", aide: "Caution ou argent pris à un client, remboursé ou rendu. Note seulement : rien n'entre dans la caisse." },
  { key: "demande", label: "Demandes spécifiques", aide: "Demande d'un client ou du propriétaire : lit bébé, arrivée tardive, cuisinière..." },
  { key: "general", label: "Suivi général", aide: "Tout le reste : information utile sur le logement ou la journée." },
] as const;

export type CategorieNote = (typeof CATEGORIES_NOTES)[number]["key"];
export const CLES_CATEGORIES_NOTES = CATEGORIES_NOTES.map((c) => c.key) as CategorieNote[];

export function categorieNoteValide(valeur: unknown): CategorieNote {
  return (CLES_CATEGORIES_NOTES as string[]).includes(String(valeur)) ? (valeur as CategorieNote) : "general";
}

export function libelleCategorieNote(cle: string): string {
  return CATEGORIES_NOTES.find((c) => c.key === cle)?.label ?? "Suivi général";
}
