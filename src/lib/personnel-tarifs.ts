import { differenceInCalendarDays } from "date-fns";

// Tarifs fixes payés en liquide, définis une seule fois ici pour que le calcul soit cohérent
// partout : 200 MAD par ménage confirmé fait ; côté cuisine, 100 MAD/jour si elle ne fait que
// le petit-déjeuner, 200 MAD/jour si elle fait aussi le déjeuner.
export const TARIF_MENAGE = 200;
export const TARIF_CUISINE_PETIT_DEJEUNER = 100;
export const TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER = 200;

// Le ménage est dû dès qu'il est confirmé fait (pas juste affecté) — c'est le moment où,
// dans la réalité, la villa est propre et prête pour l'arrivée suivante.
export function montantMenageDu(faitAt: Date | null): number {
  return faitAt ? TARIF_MENAGE : 0;
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
