import type { Beds24CalendarDay } from "./client";

// Détection des nuits isolées, sans accès réseau ni base (testable seule) — utilisée par
// lib/beds24/nuits-isolees.ts.

export function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function jjmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

// true = nuit libre, false = indisponible (séjour, blocage, fermeture), null = inconnue.
export function nuitLibre(jour: Beds24CalendarDay | undefined): boolean | null {
  if (!jour) return null;
  if (jour.override === "blackout") return false;
  if (jour.numAvail == null) return null;
  return jour.numAvail > 0;
}

// Écarts de nuits libres bornés des deux côtés par une nuit indisponible. Le début de la fenêtre
// (aujourd'hui) compte comme une borne : personne ne peut arriver dans le passé. Une nuit inconnue
// (absente de la réponse Beds24) coupe l'écart sans servir de borne, par prudence.
export function ecartsLibres(jours: Beds24CalendarDay[], debutFenetre: string, finFenetre: string): { debut: string; dates: string[] }[] {
  const parDate = new Map(jours.map((j) => [j.date, j]));
  const ecarts: { debut: string; dates: string[] }[] = [];
  let courant: string[] = [];
  let borneGauche = true; // début de fenêtre

  const fermer = (borneDroite: boolean) => {
    if (courant.length > 0 && borneGauche && borneDroite) ecarts.push({ debut: courant[0], dates: courant });
    courant = [];
  };

  for (let date = debutFenetre; date <= finFenetre; date = ajouterJours(date, 1)) {
    const libre = nuitLibre(parDate.get(date));
    if (libre === true) {
      courant.push(date);
      continue;
    }
    fermer(libre === false);
    borneGauche = libre === false;
  }
  // Écart qui dépasse la fin de la fenêtre : non borné à droite, ignoré.
  courant = [];
  return ecarts;
}

// Séjour minimum "habituel" du logement : la valeur la plus fréquente sur les nuits libres.
export function nuitsMinHabituel(jours: Beds24CalendarDay[]): number | null {
  const compte = new Map<number, number>();
  for (const j of jours) {
    if (nuitLibre(j) !== true || j.minStay == null || j.minStay < 1) continue;
    compte.set(j.minStay, (compte.get(j.minStay) ?? 0) + 1);
  }
  let meilleur: number | null = null;
  let max = 0;
  for (const [valeur, n] of compte) {
    if (n > max || (n === max && meilleur != null && valeur > meilleur)) {
      meilleur = valeur;
      max = n;
    }
  }
  return meilleur;
}

// Regroupe des dates consécutives de même valeur en plages Beds24 { from, to, minStay }.
export function plages(valeurs: { date: string; minStay: number }[]): { from: string; to: string; minStay: number }[] {
  const tri = [...valeurs].sort((a, b) => a.date.localeCompare(b.date));
  const out: { from: string; to: string; minStay: number }[] = [];
  for (const v of tri) {
    const dernier = out[out.length - 1];
    if (dernier && dernier.minStay === v.minStay && ajouterJours(dernier.to, 1) === v.date) dernier.to = v.date;
    else out.push({ from: v.date, to: v.date, minStay: v.minStay });
  }
  return out;
}
