// Correspondance villas de l'app -> propriétés/chambres Beds24, établie lors de la bascule
// SuperHote -> Beds24 (2026-10-13). Chaque villa Beds24 est une propriété à une seule chambre :
// c'est le roomId qui sert à la synchro des réservations (voir sync.ts).
//
// Les mots-clés sont comparés au nom de la villa (villas.nom) sans tenir compte de la casse ni
// des accents, et uniquement en mot entier : "Lina" ne doit pas attraper "Livia"/"Alba"/"Lila",
// ni "Mila" une "Milabel". Alba n'a pas encore de chambre Beds24 : volontairement absente.

export type Beds24VillaMapping = {
  label: string; // nom affiché dans le rapport
  keywords: string[];
  propertyId: number;
  roomId: number;
  // true = jamais liée automatiquement (à faire à la main si besoin), mais gardée ici pour
  // mémoire des identifiants.
  skip?: boolean;
};

export const BEDS24_VILLA_MAPPING: Beds24VillaMapping[] = [
  { label: "Tania", keywords: ["Tania"], propertyId: 360239, roomId: 742727 },
  { label: "Azur", keywords: ["Azur"], propertyId: 360233, roomId: 742721 },
  { label: "Mama (N13)", keywords: ["Mama", "N13", "N 13"], propertyId: 360234, roomId: 742722 },
  { label: "Maeva", keywords: ["Maeva"], propertyId: 360235, roomId: 742723 },
  { label: "Livia", keywords: ["Livia"], propertyId: 360236, roomId: 742724 },
  { label: "Mya", keywords: ["Mya"], propertyId: 360237, roomId: 742725 },
  { label: "Lina", keywords: ["Lina"], propertyId: 360238, roomId: 742726 },
  { label: "Sofya", keywords: ["Sofya"], propertyId: 360240, roomId: 742728 },
  { label: "Gaspard", keywords: ["Gaspard"], propertyId: 360241, roomId: 742729 },
  { label: "Lila", keywords: ["Lila", "Lilas"], propertyId: 360242, roomId: 742730 },
  { label: "Amal", keywords: ["Amal"], propertyId: 360243, roomId: 742731 },
  { label: "Nina", keywords: ["Nina"], propertyId: 360244, roomId: 742732 },
  { label: "Mila", keywords: ["Mila"], propertyId: 360245, roomId: 742733 },
  { label: "Jade", keywords: ["Jade"], propertyId: 360246, roomId: 742734 },
  { label: "Nessya", keywords: ["Nessya"], propertyId: 360248, roomId: 742736 },
  { label: "Wimiliim", keywords: ["Wimiliim", "Wimillim", "Villa 16"], propertyId: 360249, roomId: 742737 },
  { label: "Eline", keywords: ["Eline"], propertyId: 360232, roomId: 742720, skip: true },
];

// Minuscules, sans accents, tout ce qui n'est ni lettre ni chiffre remplacé par un espace —
// "Villa Mamá (N°13)" -> "villa mama n 13".
export function normalizeVillaName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Correspondance en mot entier sur le nom normalisé : on encadre les deux côtés d'espaces, ce
// qui évite toute regex construite à partir des mots-clés.
export function villaNameMatchesKeyword(villaNom: string, keyword: string): boolean {
  const name = ` ${normalizeVillaName(villaNom)} `;
  const key = normalizeVillaName(keyword);
  if (!key) return false;
  return name.includes(` ${key} `);
}

export function villaNameMatchesMapping(villaNom: string, mapping: Beds24VillaMapping): boolean {
  return mapping.keywords.some((k) => villaNameMatchesKeyword(villaNom, k));
}
