export const TYPE_LABELS: Record<string, string> = {
  remise: "Argent confié",
  loyer: "Loyer reçu",
  extra: "Extra (petit-déj, options)",
  depense: "Dépense",
  restitution: "Restitution",
};

export const CATEGORIE_LABELS: Record<string, string> = {
  femmes_menage: "Femmes de ménage",
  cuisinieres: "Cuisinières",
  jardinier: "Jardinier / Brahim",
  hebergement: "Hébergement",
  autre: "Autre",
};

export type Entry = {
  id: string;
  type: string;
  categorie: string | null;
  financePar: string;
  montant: string;
  devise: string;
  description: string | null;
  responsable: string | null;
  createdByName: string | null;
  createdAt: Date;
  villaNom: string | null;
  villaNumero: string | null;
  domaineNom: string | null;
  photoUrls: string[] | null;
  guestName: string | null;
};
