// Correspondance code pays MRZ (alpha-3, norme ICAO 9303) -> nationalité et pays de
// provenance en français, pour préremplir la fiche police depuis un passeport scanné.
// La destination (allantA) est toujours "Maroc" pour cette agence : pas besoin de mapping.
export const NATIONALITES: Record<string, { nationalite: string; pays: string }> = {
  FRA: { nationalite: "Française", pays: "France" },
  GBR: { nationalite: "Britannique", pays: "Royaume-Uni" },
  USA: { nationalite: "Américaine", pays: "États-Unis" },
  DEU: { nationalite: "Allemande", pays: "Allemagne" },
  ESP: { nationalite: "Espagnole", pays: "Espagne" },
  ITA: { nationalite: "Italienne", pays: "Italie" },
  PRT: { nationalite: "Portugaise", pays: "Portugal" },
  NLD: { nationalite: "Néerlandaise", pays: "Pays-Bas" },
  BEL: { nationalite: "Belge", pays: "Belgique" },
  CHE: { nationalite: "Suisse", pays: "Suisse" },
  LUX: { nationalite: "Luxembourgeoise", pays: "Luxembourg" },
  IRL: { nationalite: "Irlandaise", pays: "Irlande" },
  CAN: { nationalite: "Canadienne", pays: "Canada" },
  MAR: { nationalite: "Marocaine", pays: "Maroc" },
  DZA: { nationalite: "Algérienne", pays: "Algérie" },
  TUN: { nationalite: "Tunisienne", pays: "Tunisie" },
  SWE: { nationalite: "Suédoise", pays: "Suède" },
  NOR: { nationalite: "Norvégienne", pays: "Norvège" },
  DNK: { nationalite: "Danoise", pays: "Danemark" },
  FIN: { nationalite: "Finlandaise", pays: "Finlande" },
  POL: { nationalite: "Polonaise", pays: "Pologne" },
  AUT: { nationalite: "Autrichienne", pays: "Autriche" },
  RUS: { nationalite: "Russe", pays: "Russie" },
  UKR: { nationalite: "Ukrainienne", pays: "Ukraine" },
  CHN: { nationalite: "Chinoise", pays: "Chine" },
  JPN: { nationalite: "Japonaise", pays: "Japon" },
  KOR: { nationalite: "Coréenne", pays: "Corée du Sud" },
  IND: { nationalite: "Indienne", pays: "Inde" },
  AUS: { nationalite: "Australienne", pays: "Australie" },
  NZL: { nationalite: "Néo-Zélandaise", pays: "Nouvelle-Zélande" },
  BRA: { nationalite: "Brésilienne", pays: "Brésil" },
  MEX: { nationalite: "Mexicaine", pays: "Mexique" },
  ARE: { nationalite: "Émirienne", pays: "Émirats Arabes Unis" },
  SAU: { nationalite: "Saoudienne", pays: "Arabie Saoudite" },
  QAT: { nationalite: "Qatarienne", pays: "Qatar" },
  KWT: { nationalite: "Koweïtienne", pays: "Koweït" },
  EGY: { nationalite: "Égyptienne", pays: "Égypte" },
  TUR: { nationalite: "Turque", pays: "Turquie" },
  GRC: { nationalite: "Grecque", pays: "Grèce" },
  ROU: { nationalite: "Roumaine", pays: "Roumanie" },
  CZE: { nationalite: "Tchèque", pays: "République Tchèque" },
  HUN: { nationalite: "Hongroise", pays: "Hongrie" },
  ZAF: { nationalite: "Sud-Africaine", pays: "Afrique du Sud" },
  SGP: { nationalite: "Singapourienne", pays: "Singapour" },
};

export function nationaliteFromCode(code: string | null | undefined): { nationalite: string; pays: string } | null {
  if (!code) return null;
  return NATIONALITES[code.toUpperCase().trim()] ?? null;
}
