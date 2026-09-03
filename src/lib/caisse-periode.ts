import { startOfMonth, subMonths, format } from "date-fns";

// Le mois comptable convenu avec la comptable ne suit pas le mois calendaire : il court
// du 11 au 10 du mois suivant (ex. "juillet" = 11 juillet → 10 août inclus).
export const JOUR_DEBUT_PERIODE = 11;

export function moisHref(base: string, date: Date): string {
  return `${base}?mois=${format(date, "yyyy-MM")}`;
}

export function periodeAncre(mois?: string): Date {
  if (mois && /^\d{4}-\d{2}$/.test(mois)) return new Date(`${mois}-01T00:00:00`);
  const now = new Date();
  return startOfMonth(now.getDate() >= JOUR_DEBUT_PERIODE ? now : subMonths(now, 1));
}

export function periodeBounds(ancre: Date): { debut: Date; finExclusive: Date; finAffichee: Date } {
  const debut = new Date(ancre.getFullYear(), ancre.getMonth(), JOUR_DEBUT_PERIODE);
  const finExclusive = new Date(ancre.getFullYear(), ancre.getMonth() + 1, JOUR_DEBUT_PERIODE);
  const finAffichee = new Date(ancre.getFullYear(), ancre.getMonth() + 1, JOUR_DEBUT_PERIODE - 1);
  return { debut, finExclusive, finAffichee };
}
