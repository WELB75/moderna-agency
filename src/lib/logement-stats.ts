import { addMonths, differenceInCalendarDays, endOfMonth, max as maxDate, min as minDate, startOfMonth, startOfYear } from "date-fns";

// Nombre de nuits d'une réservation qui tombent dans le mois donné (year/monthIndex 0-11) —
// une réservation à cheval sur deux mois contribue ses nuits à chacun des deux, prorata du
// nombre de nuits réellement passées dans le mois (pas juste comptée en entier sur le mois du
// check-in).
export function nuiteesDansLeMois(checkIn: Date, checkOut: Date, year: number, monthIndex: number): number {
  const debutMois = startOfMonth(new Date(year, monthIndex, 1));
  const finMoisExclusive = startOfMonth(addMonths(debutMois, 1));
  const debut = maxDate([checkIn, debutMois]);
  const fin = minDate([checkOut, finMoisExclusive]);
  return Math.max(0, differenceInCalendarDays(fin, debut));
}

// Répartit un montant total (loyer ou encaissé) au prorata des nuits passées dans chaque mois —
// une réservation de 10 nuits à 1000€ dont 3 nuits tombent en janvier attribue 300€ à janvier.
export function montantProrata(montantTotal: number, checkIn: Date, checkOut: Date, year: number, monthIndex: number): number {
  const totalNuits = differenceInCalendarDays(checkOut, checkIn);
  if (totalNuits <= 0) return 0;
  const nuitsDansLeMois = nuiteesDansLeMois(checkIn, checkOut, year, monthIndex);
  return montantTotal * (nuitsDansLeMois / totalNuits);
}

export type MontantParDevise = { devise: string; montant: number };

export function ajouterMontant(liste: MontantParDevise[], devise: string, montant: number): MontantParDevise[] {
  const idx = liste.findIndex((m) => m.devise === devise);
  if (idx === -1) return [...liste, { devise, montant }];
  const copie = [...liste];
  copie[idx] = { devise, montant: copie[idx].montant + montant };
  return copie;
}

export const MOIS_LABELS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export function anneeStart(year: number): Date {
  return startOfYear(new Date(year, 0, 1));
}

export function anneeEnd(year: number): Date {
  return endOfMonth(new Date(year, 11, 1));
}
