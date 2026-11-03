
// Détail comptable d'une réservation, pour la comptable (Kamel, 2026-11-03) : "à chaque fois tous
// les détails : cet argent-là qu'on a encaissé, ok, mais combien va au ménage, combien va à ça".
// Jusqu'ici ce détail vivait dans la note libre de la réservation ("500/nuit, ménage 200 dh,
// total 1200 dh"), donc invisible pour les chiffres. Deux blocs distincts :
// - ce qui est FACTURÉ au client, ligne par ligne, comme le devis détaillé (séjour, ménage de
//   fin de séjour, cuisinière, piscine chauffée, ménage journalier...) ;
// - ce que le séjour COÛTE à l'agence (ménage, cuisine, dépenses de caisse liées).
// Ce fichier ne contient que des fonctions pures (testées), sans accès base.

// Même règle que estDirham de lib/devises.ts, recopiée ici pour que ce fichier reste sans import
// (les tests tournent avec node --test, qui ne résout pas l'alias "@/").
function estDirham(devise: string | null | undefined): boolean {
  const code = (devise ?? "").trim().toUpperCase();
  return code === "MAD" || code === "DH" || code === "DHS";
}

export type CategorieLigne = "sejour" | "menage" | "cuisine" | "piscine" | "menage_journalier" | "autre";

export const CATEGORIES_LIGNES: { id: CategorieLigne; label: string; unite: string }[] = [
  { id: "sejour", label: "Séjour (nuitées)", unite: "nuit" },
  { id: "menage", label: "Ménage de fin de séjour", unite: "forfait" },
  { id: "cuisine", label: "Service cuisinière", unite: "jour" },
  { id: "piscine", label: "Piscine chauffée", unite: "jour" },
  { id: "menage_journalier", label: "Ménage journalier", unite: "jour" },
  { id: "autre", label: "Autre option", unite: "forfait" },
];

export function libelleCategorie(id: string): string {
  return CATEGORIES_LIGNES.find((c) => c.id === id)?.label ?? "Autre option";
}

export type LigneFacture = {
  id?: string;
  categorie: CategorieLigne;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
};

export function arrondir(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function montantLigne(l: Pick<LigneFacture, "quantite" | "prixUnitaire">): number {
  return arrondir(l.quantite * l.prixUnitaire);
}

export function totalFacture(lignes: LigneFacture[]): number {
  return arrondir(lignes.reduce((s, l) => s + montantLigne(l), 0));
}

export function totalParCategorie(lignes: LigneFacture[]): { categorie: CategorieLigne; montant: number }[] {
  const parCat = new Map<CategorieLigne, number>();
  for (const l of lignes) parCat.set(l.categorie, (parCat.get(l.categorie) ?? 0) + montantLigne(l));
  return CATEGORIES_LIGNES.filter((c) => parCat.has(c.id)).map((c) => ({ categorie: c.id, montant: arrondir(parCat.get(c.id) ?? 0) }));
}

// Nombre saisi à la française ("1 200,50") ou à l'anglaise ; vide ou illisible => 0.
export function lireNombre(valeur: string | number | null | undefined): number {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : 0;
  const propre = String(valeur ?? "")
    .replace(/\s| /g, "")
    .replace(",", ".");
  const n = Number(propre);
  return Number.isFinite(n) ? n : 0;
}

// Point de départ proposé à la comptable/à l'équipe quand rien n'est encore détaillé : le loyer
// connu est coupé en "séjour" + "ménage" si les frais de ménage sont renseignés. On ne devine pas
// si les frais de ménage sont déjà inclus dans le loyer : c'est une proposition à valider, qui
// part du principe qu'ils le sont (cas du devis type : total = nuitées + ménage + options).
export function suggererLignes(entree: { loyerTotal: number | null; fraisMenage: number | null; nuits: number }): LigneFacture[] {
  const loyer = entree.loyerTotal ?? 0;
  if (loyer <= 0) return [];
  const menage = entree.fraisMenage && entree.fraisMenage > 0 && entree.fraisMenage < loyer ? entree.fraisMenage : 0;
  const nuits = Math.max(1, entree.nuits);
  const sejour = arrondir(loyer - menage);
  const lignes: LigneFacture[] = [
    { categorie: "sejour", libelle: "Séjour", quantite: nuits, prixUnitaire: arrondir(sejour / nuits) },
  ];
  if (menage > 0) lignes.push({ categorie: "menage", libelle: "Frais de ménage de fin de séjour", quantite: 1, prixUnitaire: menage });
  return lignes;
}

export type CoutSejour = {
  cle: string;
  categorie: "menage" | "cuisine" | "caisse";
  libelle: string;
  montant: number; // dans la devise de la réservation
  montantOrigine: number;
  deviseOrigine: string;
  reel: boolean; // true = dépense de caisse enregistrée ; false = barème de l'agence (à payer ou payé hors caisse)
  detail: string | null;
};

export function convertir(montant: number, de: string, vers: string, madParEur: number): number {
  const deMad = estDirham(de);
  const versMad = estDirham(vers);
  if (deMad === versMad) return montant;
  return deMad ? montant / madParEur : montant * madParEur;
}

export type Ventilation = {
  devise: string;
  facture: number;
  encaisse: number;
  reste: number;
  ecartFacture: number; // facturé − loyer enregistré (0 = les lignes expliquent exactement le loyer)
  couts: CoutSejour[];
  totalCouts: number;
  solde: number; // encaissé − coûts du séjour (avant commission de la plateforme)
};

export function ventiler(entree: {
  devise: string;
  loyerTotal: number | null;
  montantPaye: number | null;
  lignes: LigneFacture[];
  couts: CoutSejour[];
}): Ventilation {
  const facture = totalFacture(entree.lignes);
  const encaisse = arrondir(entree.montantPaye ?? 0);
  const total = entree.lignes.length > 0 ? facture : arrondir(entree.loyerTotal ?? 0);
  const totalCouts = arrondir(entree.couts.reduce((s, c) => s + c.montant, 0));
  return {
    devise: entree.devise,
    facture,
    encaisse,
    reste: arrondir(Math.max(0, total - encaisse)),
    ecartFacture: entree.lignes.length > 0 && entree.loyerTotal != null ? arrondir(facture - entree.loyerTotal) : 0,
    couts: entree.couts,
    totalCouts,
    solde: arrondir(encaisse - totalCouts),
  };
}

export function formaterMontant(montant: number, devise: string): string {
  const symbole = estDirham(devise) ? "MAD" : devise === "EUR" || !devise ? "€" : devise;
  const texte = montant.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${texte} ${symbole}`;
}

// Montant écrit dans une note libre ("500/nuit", "ménage 200 dh", "762 €", "total 1200") : c'est du
// détail comptable, qui a sa place dans le détail financier de la réservation, pas dans une note
// où la comptable ne le voit pas.
const MONTANT_DANS_NOTE = /\d+\s*(dh|dhs|mad|€|eur|euros?)(?![a-zà-ÿ])|\b(total|acompte|tarif)\b[^\n]{0,20}\d/i;

export function noteContientUnMontant(note: string): boolean {
  return MONTANT_DANS_NOTE.test(note);
}
