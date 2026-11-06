// Revenus Airbnb / Booking.com d'une réservation, ventilés comme le demande la comptable
// (2026-11-03) : le montant affiché jusqu'ici est ce que le voyageur a payé au total, alors que le
// suivi comptable a besoin de quatre chiffres distincts :
// 1. frais de chambre : les nuitées seules, ménage exclu ("tarif par nuit" sur Booking) ;
// 2. frais de ménage facturés au voyageur ;
// 3. frais de service hôte : la commission de la plateforme ("commission et frais" sur Booking) ;
// 4. prix net des nuitées : Booking.com = frais de chambre − frais de service hôte − frais de ménage
// (sa formule) ; Airbnb = frais de chambre − frais de service hôte, sans retirer le ménage (Sanaa,
// 2026-11-04 : « pour Airbnb seulement »).
// Exemple Airbnb : 102,00 de chambre, 20,00 de ménage, 22,69 de frais de service => 79,31 net.
//
// Les données viennent des lignes de facture et de la commission renvoyées par Beds24, gardées dans
// raw_data.beds24Prix à chaque synchro. Fichier sans import : testé avec node --test.
//
// Booking.com (Sanaa, 2026-11-05, résa Keltoum Devaux, Villa Azur) : le voyageur paie 1 652 € =
// 4 nuits à 378 € (1 512 €) + ménage 60 € + 80 € de taxes non commissionnées. Calculer la chambre
// en « total − ménage » donnait 1 592 € (taxes comptées comme nuitées). Les nuitées sont désormais
// lues dans le détail des tarifs par nuit de Beds24 (rateDescription), puis dans le champ taxe ;
// ce qui reste (taxes, autres frais) est affiché à part, sans fausser la chambre.

export type PrixBeds24 = {
  price?: number | null;
  commission?: number | null;
  tax?: number | null;
  rateDescription?: string | null; // "2026-10-19 (50754861 Standard Rate) EUR 378 genius", une ligne par nuit
  invoiceItems?: { type?: string | null; description?: string | null; qty?: number | null; amount?: number | null; lineTotal?: number | null }[] | null;
};

export type RevenusPlateforme = {
  fraisChambre: number;
  fraisMenage: number;
  autresFrais: number; // taxes de séjour et autres frais payés par le voyageur, ni nuitées ni ménage
  fraisServiceHote: number | null; // null : la plateforme n'a pas transmis de commission
  prixNetNuitees: number | null;
  netSansMenage: boolean; // vrai pour Airbnb : le ménage n'est pas retiré du prix net
  totalVoyageur: number; // ce que le voyageur a payé (loyer total)
  origineMenage: "plateforme" | "reservation" | "aucun";
  origineChambre: "tarifs" | "lignes" | "calcule";
};

const MOT_MENAGE = /m[eé]nage|cleaning|nettoyage/i;
const MOT_CHAMBRE = /chambre|nuit|night|room|accommodation|h[eé]bergement|s[eé]jour|rate/i;
const MOT_FRAIS_SERVICE = /frais de service|service fee|commission|host fee|frais h[oô]te/i;

const arrondir = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Somme des tarifs par nuit du détail Beds24 : chaque ligne commence par la date de la nuit et
// porte le montant après le code devise ("2026-10-19 (50754861 Standard Rate) EUR 378 genius").
// null si aucune ligne datée n'est lisible.
export function nuiteesDeRateDescription(texte: string | null | undefined): number | null {
  if (!texte) return null;
  let somme = 0;
  let trouve = false;
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^\s*\d{4}-\d{2}-\d{2}\b.*?\b[A-Z]{3}\s*(-?\d[\d\s,.]*)/);
    if (!m) continue;
    let brut = m[1].replace(/\s/g, "");
    // "1,234.50" ou "1234,50" : la virgule est un séparateur de milliers s'il y a aussi un point.
    brut = brut.includes(".") ? brut.replace(/,/g, "") : brut.replace(",", ".");
    const n = Number.parseFloat(brut);
    if (!Number.isFinite(n)) continue;
    somme += n;
    trouve = true;
  }
  return trouve && somme > 0 ? somme : null;
}

function totalLigne(i: { qty?: number | null; amount?: number | null; lineTotal?: number | null }): number {
  if (typeof i.lineTotal === "number" && Number.isFinite(i.lineTotal)) return i.lineTotal;
  const q = typeof i.qty === "number" && i.qty > 0 ? i.qty : 1;
  return (typeof i.amount === "number" && Number.isFinite(i.amount) ? i.amount : 0) * q;
}

// `loyerTotal` : loyer enregistré dans l'app (en euros). Beds24 peut renvoyer un prix dans une
// autre devise (annonce en dirhams) : tous les montants sont ramenés à l'échelle du loyer enregistré.
// `fraisMenageReservation` : repli quand Beds24 ne détaille pas le ménage.
export function calculerRevenusPlateforme(
  prix: PrixBeds24 | null | undefined,
  loyerTotal: number | null,
  fraisMenageReservation: number | null,
  canal: string | null = null
): RevenusPlateforme | null {
  if (!prix) return null;
  const prixBeds24 = Number(prix.price) || 0;
  const total = loyerTotal && loyerTotal > 0 ? loyerTotal : prixBeds24;
  if (total <= 0) return null;
  const echelle = prixBeds24 > 0 && loyerTotal && loyerTotal > 0 ? loyerTotal / prixBeds24 : 1;

  const lignes = (prix.invoiceItems ?? []).filter((i) => (i.type ?? "charge").toLowerCase() !== "payment");
  const somme = (garde: (d: string) => boolean) =>
    lignes.filter((i) => garde(i.description ?? "")).reduce((s, i) => s + totalLigne(i), 0) * echelle;

  const menageLignes = lignes.filter((i) => MOT_MENAGE.test(i.description ?? ""));
  const menagePlateforme = menageLignes.length > 0 ? Math.abs(somme((d) => MOT_MENAGE.test(d))) : 0;
  let fraisMenage = menagePlateforme;
  let origineMenage: RevenusPlateforme["origineMenage"] = menagePlateforme > 0 ? "plateforme" : "aucun";
  if (menagePlateforme === 0 && fraisMenageReservation && fraisMenageReservation > 0 && fraisMenageReservation < total) {
    fraisMenage = fraisMenageReservation;
    origineMenage = "reservation";
  }

  // Commission : le champ dédié de Beds24 en priorité, sinon une ligne négative "frais de service".
  let commission: number | null = null;
  if (typeof prix.commission === "number" && Math.abs(prix.commission) > 0) commission = Math.abs(prix.commission) * echelle;
  else {
    const lignesFrais = lignes.filter((i) => MOT_FRAIS_SERVICE.test(i.description ?? ""));
    if (lignesFrais.length > 0) commission = Math.abs(lignesFrais.reduce((s, i) => s + totalLigne(i), 0)) * echelle;
  }

  const chambreLignes = lignes.filter((i) => MOT_CHAMBRE.test(i.description ?? "") && !MOT_MENAGE.test(i.description ?? "") && !MOT_FRAIS_SERVICE.test(i.description ?? "") && totalLigne(i) > 0);
  let fraisChambre: number;
  let origineChambre: RevenusPlateforme["origineChambre"];
  // Airbnb : Beds24 renvoie parfois une seule ligne égale au prix voyageur moins la commission
  // (278 − 51,71 = 226,29), c'est-à-dire ce que touche l'hôte, pas le prix de la chambre (258).
  // Cette ligne n'est alors pas un tarif de nuitées : on retombe sur total − ménage.
  const totalLignes = lignes.reduce((s, i) => s + totalLigne(i), 0) * echelle;
  const lignesNetCommission = commission !== null && Math.abs(totalLignes - (total - commission)) < 0.05;
  // Booking.com : le tarif par nuit transmis par Booking fait foi. Pas pour Airbnb, dont les
  // montants Beds24 sont souvent nets de commission (voir ci-dessus).
  const nuitees = /airbnb/i.test(canal ?? "") ? null : nuiteesDeRateDescription(prix.rateDescription);
  const nuiteesEchelle = nuitees === null ? null : nuitees * echelle;
  const taxe = typeof prix.tax === "number" && prix.tax > 0 ? prix.tax * echelle : 0;
  if (nuiteesEchelle !== null && nuiteesEchelle <= total + 0.05) {
    fraisChambre = nuiteesEchelle;
    origineChambre = "tarifs";
  } else if (chambreLignes.length > 0 && !lignesNetCommission) {
    fraisChambre = chambreLignes.reduce((s, i) => s + totalLigne(i), 0) * echelle;
    origineChambre = "lignes";
  } else {
    // Les taxes connues (taxe de séjour) ne sont pas des nuitées.
    fraisChambre = total - fraisMenage - (taxe < total - fraisMenage ? taxe : 0);
    origineChambre = "calcule";
  }
  // Ménage pris sur la fiche alors que les nuitées sont connues : il ne peut pas dépasser ce qui
  // reste du total une fois les nuitées retirées.
  if (origineChambre === "tarifs" && origineMenage === "reservation" && fraisMenage > total - fraisChambre + 0.05) {
    fraisMenage = Math.max(0, total - fraisChambre);
    if (fraisMenage === 0) origineMenage = "aucun";
  }
  const reste = total - fraisChambre - fraisMenage;
  const autresFrais = reste > 0.05 ? reste : 0;

  const netSansMenage = /airbnb/i.test(canal ?? "");
  const net = commission === null ? null : fraisChambre - commission - (netSansMenage ? 0 : fraisMenage);
  return {
    fraisChambre: arrondir(fraisChambre),
    fraisMenage: arrondir(fraisMenage),
    autresFrais: arrondir(autresFrais),
    fraisServiceHote: commission === null ? null : arrondir(commission),
    prixNetNuitees: net === null ? null : arrondir(net),
    netSansMenage,
    totalVoyageur: arrondir(total),
    origineMenage,
    origineChambre,
  };
}

export function prixBeds24DeRawData(rawData: unknown): PrixBeds24 | null {
  const p = (rawData as { beds24Prix?: PrixBeds24 } | null)?.beds24Prix;
  return p && typeof p === "object" ? p : null;
}

export function estCanalPlateforme(canal: string | null | undefined): boolean {
  return /airbnb|booking/i.test(canal ?? "");
}
