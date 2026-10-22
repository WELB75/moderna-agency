// Modèles de la « Fiche d'inventaire - Villa » papier (2026-10-22). Les mêmes questions pour
// chaque chambre et chaque salle de bain, de toutes les villas : le modèle vit ici, les réponses
// en base (villa_inventaire_pieces.details, rangées par clé de groupe puis clé de ligne).

export type Groupe = {
  cle: string;
  titre: string;
  // grille : tableau lignes x colonnes, plusieurs cases possibles par ligne.
  // questions : chaque ligne a ses propres choix, une seule réponse.
  // linge : quantité + état par article.
  mode: "grille" | "questions" | "linge";
  colonnes?: string[];
  lignes: { cle: string; libelle: string; choix?: string[] }[];
};

const l = (libelle: string, choix?: string[]) => ({
  cle: libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, ""),
  libelle,
  choix,
});

const OUI_NON = ["Oui", "Non"];

export const MODELE_CHAMBRE: Groupe[] = [
  {
    cle: "equipements",
    titre: "Équipements",
    mode: "grille",
    colonnes: ["Bon état", "Taché", "Abîmé", "Cassé", "Fonctionne"],
    lignes: [
      "Lit",
      "Matelas",
      "Sommier",
      "Télévision",
      "Télécommande TV",
      "Climatisation",
      "Télécommande clim / contrôleur",
      "Tables de chevet",
      "Lampes",
      "Armoire / placard",
      "Cintres",
      "Rideaux",
      "Volet roulant",
      "Miroir",
      "Tapis",
    ].map((x) => l(x)),
  },
  {
    cle: "climatisation",
    titre: "Climatisation",
    mode: "questions",
    lignes: [
      l("Fonctionne", OUI_NON),
      l("Refroidit correctement", OUI_NON),
      l("Télécommande fonctionne", OUI_NON),
      l("Bruit anormal", OUI_NON),
      l("Fuite d'eau", OUI_NON),
    ],
  },
  {
    cle: "linge",
    titre: "Linge de lit",
    mode: "linge",
    colonnes: ["Bon état", "Taché", "Abîmé"],
    lignes: [
      "Oreillers",
      "Protège-matelas",
      "Draps-housses",
      "Draps plats",
      "Housses de couette",
      "Couettes",
      "Coussins décoratifs",
      "Housses de coussins",
      "Plaids / couvertures",
    ].map((x) => l(x)),
  },
];

export const MODELE_SALLE_DE_BAIN: Groupe[] = [
  {
    cle: "eau",
    titre: "Eau & douche",
    mode: "questions",
    lignes: [
      l("Eau chaude", ["Fonctionne", "Ne fonctionne pas"]),
      l("Eau froide", ["Fonctionne", "Ne fonctionne pas"]),
      l("Pression d'eau", ["Bonne", "Faible"]),
      l("Évacuation", ["Bonne", "Lente", "Bouchée"]),
      l("Fuite", ["Non", "Oui"]),
    ],
  },
  {
    cle: "douche",
    titre: "Douche",
    mode: "grille",
    colonnes: ["Bon état", "Abîmé", "Cassé", "Fonctionne"],
    lignes: [
      "Pommeau",
      "Flexible",
      "Robinet / mitigeur",
      "Support pommeau",
      "Porte de douche",
      "Paroi",
      "Bonde / évacuation",
      "Baignoire (si présente)",
    ].map((x) => l(x)),
  },
  {
    cle: "portes",
    titre: "Portes & accessoires",
    mode: "grille",
    colonnes: ["Bon état", "Bien fixé", "Desserré", "Cassé"],
    lignes: [
      "Porte salle de bain",
      "Poignée",
      "Porte-serviettes",
      "Porte-papier WC",
      "Support savon",
      "Support shampoing",
      "Patères / crochets",
    ].map((x) => l(x)),
  },
  {
    cle: "wc",
    titre: "WC & lavabo",
    mode: "questions",
    lignes: [
      l("Chasse d'eau", ["Fonctionne", "Problème"]),
      l("Fuite WC", ["Non", "Oui"]),
      l("Abattant", ["Bon état", "Desserré", "Cassé"]),
      l("Lavabo", ["Bon état", "Taché", "Fissuré"]),
      l("Robinet", ["Fonctionne", "Fuite", "Abîmé"]),
      l("Évacuation lavabo", ["Bonne", "Lente", "Bouchée"]),
      l("Miroir", ["Bon état", "Taché", "Abîmé"]),
    ],
  },
  {
    cle: "general",
    titre: "État général",
    mode: "questions",
    lignes: [
      l("Murs", ["Bon état", "Tachés", "Traces", "Abîmés", "Fissures"]),
      l("Plafond", ["Bon état", "Taché", "Moisissure", "Fissures"]),
      l("Sol", ["Bon état", "Taché", "Abîmé"]),
      l("Carrelage", ["Bon état", "Cassé", "Fissuré"]),
      l("Joints", ["Propres", "Noircis", "Abîmés", "À refaire"]),
      l("Éclairage", ["Fonctionne", "Problème"]),
      l("Ventilation", ["Fonctionne", "Problème"]),
    ],
  },
];

export function modelePourType(type: "chambre" | "salle_de_bain" | "zone"): Groupe[] {
  if (type === "chambre") return MODELE_CHAMBRE;
  if (type === "salle_de_bain") return MODELE_SALLE_DE_BAIN;
  return [];
}
