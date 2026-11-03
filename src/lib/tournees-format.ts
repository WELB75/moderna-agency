// Planning hebdomadaire des intervenants extérieurs qui tournent sur les domaines : Brahim
// (jardinier) et Rachid (pisciniste). Kamel, 2026-11-03 : plannings papier « HEBDOMADAIRE »
// reportés dans l'app, consultables aussi depuis l'assistant Telegram.
//
// Ce fichier est pur (aucun accès base) pour pouvoir être testé : les types, les données de départ
// et la mise en texte. L'accès base est dans lib/tournees.ts.

export const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

export type Metier = "jardinier" | "pisciniste";

export type PassageTournee = {
  // 1 = lundi ... 7 = dimanche
  jour: number;
  // « Domaine 17 », « Domaine 08 », « Noria » ou null quand le planning n'en donne pas.
  domaine: string | null;
  // Numéros de villas tels qu'écrits sur le planning papier (« 13, 15, 14, 16 »).
  villas: string | null;
  note: string | null;
};

export type EquipierTournee = { id: string; nom: string; metier: Metier; telephone: string | null; actif: boolean; passages: PassageTournee[] };

// Le planning papier parle de « Domaine 17 » et « Domaine 08 », l'app de « Domaine Moderna II » et
// « Domaine Zaraba » (mêmes numéros de villas : Zaraba a les villas 1, 2 et 7).
export const DOMAINE_PLANNING_VERS_APP: Record<string, string> = {
  "Domaine 17": "Domaine Moderna II",
  "Domaine 08": "Domaine Zaraba",
  Noria: "Noria",
};

// 1 = lundi ... 7 = dimanche, à partir d'une date locale.
export function jourSemaineNumero(date: Date): number {
  const j = date.getDay();
  return j === 0 ? 7 : j;
}

export function nomJour(jour: number): string {
  return JOURS_SEMAINE[jour - 1] ?? "";
}

export function estRepos(p: PassageTournee): boolean {
  return !p.domaine && !p.villas && /^repos$/i.test((p.note ?? "").trim());
}

// « Domaine 17 : villas 13, 15, 14, 16 » / « Noria : 4 appartements » / « Repos ».
export function texteLieu(p: PassageTournee): string {
  if (estRepos(p)) return "Repos";
  const villas = p.villas ? `${p.villas.includes(",") ? "villas" : "villa"} ${p.villas}` : null;
  const lieu = [p.domaine, villas].filter(Boolean);
  const base = p.domaine && villas ? `${p.domaine} : ${villas}` : lieu.join("");
  return [base, p.note].filter(Boolean).join(" · ");
}

const PIECE_HORS_DOMAINE = "Domaine non précisé sur le planning papier.";
const BARREES = "villa 1 et villa 7 barrées à la main sur le planning papier (retirées de la gestion).";

export const EQUIPE_TOURNEES_DEPART: { nom: string; metier: Metier; passages: PassageTournee[] }[] = [
  {
    nom: "Brahim",
    metier: "jardinier",
    passages: [
      { jour: 1, domaine: "Domaine 17", villas: "9, 8, 4, 3, 10, 11, 12, 7", note: null },
      { jour: 2, domaine: "Domaine 17", villas: "9, 8, 4, 3, 10, 11, 12, 7", note: null },
      { jour: 3, domaine: "Domaine 08", villas: "1, 2, 7", note: BARREES },
      { jour: 4, domaine: "Noria", villas: null, note: "4 appartements" },
      { jour: 5, domaine: "Domaine 17", villas: "9, 8, 4, 3, 10, 11, 12, 7", note: null },
      { jour: 6, domaine: "Domaine 08", villas: "1, 2, 7", note: BARREES },
      { jour: 7, domaine: null, villas: null, note: "Repos" },
    ],
  },
  {
    nom: "Rachid",
    metier: "pisciniste",
    passages: [
      { jour: 1, domaine: "Domaine 17", villas: "13, 15, 14, 16", note: null },
      { jour: 1, domaine: "Domaine 08", villas: "1, 2, 7", note: null },
      { jour: 2, domaine: "Domaine 17", villas: "4, 3, 5, 6, 7, 2", note: null },
      { jour: 3, domaine: "Domaine 08", villas: "1, 2, 7", note: BARREES },
      { jour: 3, domaine: "Domaine 17", villas: "13, 14, 15, 16", note: null },
      { jour: 4, domaine: "Domaine 17", villas: "3, 4, 5, 6, 2", note: null },
      { jour: 5, domaine: "Domaine 08", villas: "1, 2, 7", note: null },
      { jour: 5, domaine: "Domaine 17", villas: "2, 7", note: null },
      { jour: 6, domaine: null, villas: "4, 5, 13", note: `+ contrôle général des piscines des autres villas. ${PIECE_HORS_DOMAINE}` },
      { jour: 7, domaine: null, villas: null, note: "Repos" },
    ],
  },
];

export function passagesDuJour(equipier: { passages: PassageTournee[] }, jour: number): PassageTournee[] {
  return equipier.passages.filter((p) => p.jour === jour);
}

// Phrase prête à l'emploi : « Brahim (jardinier), mardi : Domaine 17 : villas 9, 8, ... »
export function phraseJour(equipier: { nom: string; metier: Metier; passages: PassageTournee[] }, jour: number): string {
  const passages = passagesDuJour(equipier, jour);
  const lieux = passages.length > 0 ? passages.map(texteLieu).join(" ; ") : "rien de prévu sur le planning";
  return `${equipier.nom} (${equipier.metier}), ${nomJour(jour)} : ${lieux}`;
}
