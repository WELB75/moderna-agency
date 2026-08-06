import { differenceInCalendarDays } from "date-fns";

// L'exemption "payé par le propriétaire" est propre à certaines personnes précises pour une
// villa donnée (ex. Khaoula pour la Villa Sofya, Aisha pour la Villa Wimiliim), pas à toute la
// villa : les autres femmes de ménage/cuisinières qui y interviennent restent payées par
// l'agence normalement.
export function estPayeParProprietaire(noms: string[] | null | undefined, nom: string): boolean {
  if (!noms || noms.length === 0) return false;
  const cible = nom.trim().toLowerCase();
  return noms.some((n) => n.trim().toLowerCase() === cible);
}

// Tarifs fixes payés en liquide, définis une seule fois ici pour que le calcul soit cohérent
// partout : 200 MAD par ménage confirmé fait ; côté cuisine, 100 MAD/jour si elle ne fait que
// le petit-déjeuner, 200 MAD/jour si elle fait aussi le déjeuner.
export const TARIF_MENAGE = 200;
export const TARIF_CUISINE_PETIT_DEJEUNER = 100;
export const TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER = 200;

// Le ménage est dû dès qu'il est confirmé fait (pas juste affecté) — c'est le moment où,
// dans la réalité, la villa est propre et prête pour l'arrivée suivante. `nbJours` permet de
// couvrir aussi la femme de ménage sollicitée PENDANT le séjour (pas seulement le nettoyage de
// fin de séjour) : même tarif journalier que le ménage de fin de séjour (200 MAD), Kamel
// 2026-08-06 — nul (cas le plus courant, un seul passage) revient au comportement d'origine.
export function montantMenageDu(faitAt: Date | null, nbJours: number | null = null): number {
  if (!faitAt) return 0;
  return (nbJours ?? 1) * TARIF_MENAGE;
}

// La cuisine est due au check-out du client (son séjour, donc son besoin de cuisine, est
// terminé) — pas avant, même si elle a été affectée à l'avance.
export function montantCuisineDu(
  nbJours: number | null,
  checkIn: Date,
  checkOut: Date,
  checkoutValideAt: Date | null,
  avecDejeuner: boolean
): number {
  if (!checkoutValideAt) return 0;
  const jours = nbJours ?? Math.max(1, differenceInCalendarDays(checkOut, checkIn));
  const tarifJour = avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER;
  return jours * tarifJour;
}
