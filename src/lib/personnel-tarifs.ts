import { differenceInCalendarDays, startOfDay } from "date-fns";
import { nowInMorocco } from "@/lib/now";

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

// Appartements du domaine Noria : tarif ménage différent des villas, selon le nombre de
// chambres — Kamel, 2026-09-29 : "pour les frais de menage a noria c'est different des villas,
// c'est 100 MAD pour une chambre et 150 MAD pour les deux chambres".
export const TARIF_MENAGE_NORIA_UNE_CHAMBRE = 100;
export const TARIF_MENAGE_NORIA_DEUX_CHAMBRES = 150;

export type VillaTarifContext = { domaineNom: string | null; nbChambres: number | null };

// Exporté (contrairement à la version interne ci-dessous) pour les estimations affichées AVANT
// que le ménage soit confirmé fait (ex. "cash à prévoir" sur le tableau de bord) — montantMenageDu
// ne convient pas là puisqu'il renvoie toujours 0 tant que faitAt est vide.
export function tarifMenageJournalier(villa: VillaTarifContext | null): number {
  if (villa?.domaineNom !== "Noria") return TARIF_MENAGE;
  // nbChambres pas encore renseigné pour cet appartement : mieux vaut retomber sur le tarif
  // villa standard (signal visible, à corriger en remplissant nbChambres) que deviner un
  // montant Noria potentiellement faux.
  if (villa.nbChambres === 1) return TARIF_MENAGE_NORIA_UNE_CHAMBRE;
  if (villa.nbChambres === 2) return TARIF_MENAGE_NORIA_DEUX_CHAMBRES;
  return TARIF_MENAGE;
}

// Le ménage est dû dès qu'il est confirmé fait (pas juste affecté) — c'est le moment où,
// dans la réalité, la villa est propre et prête pour l'arrivée suivante. `nbJours` permet de
// couvrir aussi la femme de ménage sollicitée PENDANT le séjour (pas seulement le nettoyage de
// fin de séjour) : même tarif journalier que le ménage de fin de séjour, Kamel 2026-08-06 — nul
// (cas le plus courant, un seul passage) revient au comportement d'origine. `villa` optionnel :
// omis (ou domaine différent de Noria), retombe sur le tarif villa standard (200 MAD/jour).
export function montantMenageDu(faitAt: Date | null, nbJours: number | null = null, villa: VillaTarifContext | null = null): number {
  if (!faitAt) return 0;
  return (nbJours ?? 1) * tarifMenageJournalier(villa);
}

// La cuisine est due au check-out du client (son séjour, donc son besoin de cuisine, est
// terminé) — pas avant, même si elle a été affectée à l'avance.
//
// Exception, Kamel 2026-08-28 : "khadija a fait qu'un jour donc je l'ai deja payer" — quand
// plusieurs personnes se partagent les jours d'une même réservation (voir
// planning-jours-affectation.ts), celle qui a fini SA part n'a pas à attendre que le CLIENT
// parte pour être payée : `finTravaillePersonneSiPartagee` (sa propre date de fin, seulement
// quand elle partage avec quelqu'un d'autre) débloque le paiement dès que cette date est
// atteinte, indépendamment du check-out du séjour. Le cas normal (une seule personne sur toute
// la mission) n'est pas concerné : il continue d'exiger le check-out validé, comme avant.
export function montantCuisineDu(
  nbJours: number | null,
  checkIn: Date,
  checkOut: Date,
  checkoutValideAt: Date | null,
  avecDejeuner: boolean,
  finTravaillePersonneSiPartagee: Date | null = null,
  now: Date = nowInMorocco()
): number {
  const dejaTermine =
    checkoutValideAt !== null ||
    (finTravaillePersonneSiPartagee !== null && startOfDay(finTravaillePersonneSiPartagee) <= startOfDay(now));
  if (!dejaTermine) return 0;
  const jours = nbJours ?? Math.max(1, differenceInCalendarDays(checkOut, checkIn));
  const tarifJour = avecDejeuner ? TARIF_CUISINE_PETIT_DEJEUNER_DEJEUNER : TARIF_CUISINE_PETIT_DEJEUNER;
  return jours * tarifJour;
}
