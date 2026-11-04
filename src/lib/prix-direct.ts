// Prix direct d'un logement dérivé de son prix PriceLabs — Kamel, 2026-11-04, Villa Lila : le
// propriétaire veut 340 / 450 / 750 € net (mini / base / maximum) sur Airbnb et Booking, réglés
// dans PriceLabs, et 390 / 530 / 780 € net en direct. Les devis directs gardent donc la courbe
// PriceLabs (le prix suit la demande), replacée dans la fourchette directe : au mini PriceLabs on
// donne le mini direct, à la base la base directe, au maximum le maximum direct, et
// proportionnellement entre les deux. Pas de commission ajoutée : le tarif direct est le prix final.

export type Fourchette = { min: number; base: number; max: number };

function fourchetteValide(f: Fourchette | null | undefined): f is Fourchette {
  return Boolean(f) && [f!.min, f!.base, f!.max].every((n) => Number.isFinite(n) && n > 0) && f!.min <= f!.base && f!.base <= f!.max;
}

function interpoler(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// Prix plateforme → prix direct. Hors de la fourchette plateforme (PriceLabs peut dépasser le
// mini ou le maximum avec un override), on borne au mini / maximum direct. Arrondi à l'euro.
// Si l'une des deux fourchettes est inconnue ou incohérente, le prix est rendu inchangé : mieux
// vaut le prix PriceLabs qu'un prix faux.
export function prixDirect(prix: number, plateforme: Fourchette | null | undefined, direct: Fourchette | null | undefined): number {
  if (!fourchetteValide(plateforme) || !fourchetteValide(direct)) return prix;
  if (prix <= plateforme.min) return direct.min;
  if (prix >= plateforme.max) return direct.max;
  const v =
    prix <= plateforme.base
      ? interpoler(prix, plateforme.min, plateforme.base, direct.min, direct.base)
      : interpoler(prix, plateforme.base, plateforme.max, direct.base, direct.max);
  return Math.round(v);
}
