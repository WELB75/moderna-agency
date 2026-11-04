import type { LigneFacture } from "./compta-reservation-format.ts";

// Détail demandé par la comptable (Sanaa, 2026-11-04) pour chaque séjour, chaque mois :
// « prix location sans extra, frais de ménage check-out, extra cuisinière, extra ménage, extra
// pompe à chaleur ». Correspondance avec les lignes de facture de l'app :
// - prix location sans extra = ligne « séjour » (nuitées), ou frais de chambre Airbnb / Booking.com ;
// - ménage check-out = ménage de fin de séjour ;
// - extra cuisinière = service cuisinière ;
// - extra ménage = ménage journalier (pendant le séjour) ;
// - extra pompe à chaleur = piscine chauffée (la pompe à chaleur chauffe la piscine).
// Toute autre option va dans « autres extras », pour que la somme des colonnes retombe sur le total.
// Fichier sans accès base : testé avec node --test.

export type DetailComptable = {
  location: number;
  menageCheckout: number;
  cuisine: number;
  menageExtra: number;
  pompeAChaleur: number;
  autresExtras: number;
  // « non_detaille » : seul le loyer total est connu, compté en location.
  // « note » : déduit de la note libre de la réservation (lib/compta-note.ts), à vérifier.
  source: "lignes" | "plateforme" | "note" | "non_detaille";
};

const arrondir = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function detailComptable(entree: {
  lignes: LigneFacture[]; // en euros
  loyerTotal: number; // loyer ou total facturé, en euros
  revenus: { fraisChambre: number; fraisMenage: number } | null; // Airbnb / Booking.com
  // Détail lu dans la note de la réservation, en euros, quand rien d'autre n'est renseigné.
  note?: { location: number; menage: number; cuisine: number; menageExtra: number; pompeAChaleur: number } | null;
}): DetailComptable {
  const { lignes, revenus } = entree;
  if (lignes.length > 0) {
    const cat = (c: LigneFacture["categorie"]) => arrondir(lignes.filter((l) => l.categorie === c).reduce((s, l) => s + l.quantite * l.prixUnitaire, 0));
    return {
      location: cat("sejour"),
      menageCheckout: cat("menage"),
      cuisine: cat("cuisine"),
      menageExtra: cat("menage_journalier"),
      pompeAChaleur: cat("piscine"),
      autresExtras: cat("autre"),
      source: "lignes",
    };
  }
  if (revenus) {
    return { location: revenus.fraisChambre, menageCheckout: revenus.fraisMenage, cuisine: 0, menageExtra: 0, pompeAChaleur: 0, autresExtras: 0, source: "plateforme" };
  }
  if (entree.note) {
    const n = entree.note;
    return { location: n.location, menageCheckout: n.menage, cuisine: n.cuisine, menageExtra: n.menageExtra, pompeAChaleur: n.pompeAChaleur, autresExtras: 0, source: "note" };
  }
  return { location: arrondir(entree.loyerTotal), menageCheckout: 0, cuisine: 0, menageExtra: 0, pompeAChaleur: 0, autresExtras: 0, source: "non_detaille" };
}

export function totalDetail(d: DetailComptable): number {
  return arrondir(d.location + d.menageCheckout + d.cuisine + d.menageExtra + d.pompeAChaleur + d.autresExtras);
}

export function sommeDetails(liste: DetailComptable[]): DetailComptable {
  const s = (f: (d: DetailComptable) => number) => arrondir(liste.reduce((t, d) => t + f(d), 0));
  return {
    location: s((d) => d.location),
    menageCheckout: s((d) => d.menageCheckout),
    cuisine: s((d) => d.cuisine),
    menageExtra: s((d) => d.menageExtra),
    pompeAChaleur: s((d) => d.pompeAChaleur),
    autresExtras: s((d) => d.autresExtras),
    source: "lignes",
  };
}
