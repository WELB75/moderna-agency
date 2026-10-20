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

// Séjour minimum par défaut de l'agence (consigne : 2 nuits minimum sur tous les logements),
// utilisé quand PriceLabs ne donne pas de valeur pour une date.
export const NUITS_MIN_PAR_DEFAUT = 2;

export type SourceNuitsMin = "manuel" | "isolee" | "pricelabs" | "defaut";

export type EcartAnalyse = {
  debut: string;
  dates: string[];
  nuits: number;
  base: number; // séjour minimum normal de la première nuit (manuel, PriceLabs ou défaut)
  arriveeInterdite: boolean;
  departInterdit: boolean;
};

// Séjour minimum VOULU pour chaque date de la fenêtre, par ordre de priorité :
// 1. valeur fixée à la main dans l'app (panneau "Nombre de nuits minimum") ;
// 2. nuit isolée : longueur de l'écart (ex. 1 nuit libre entre deux séjours → 1), sur TOUTES
//    les nuits de l'écart (Beds24 est en "Stay Through" : chaque nuit du séjour est contrôlée) ;
// 3. valeur calculée par PriceLabs (profil "Min 2 nuits", règle des nuitées orphelines, dérogations) ;
// 4. NUITS_MIN_PAR_DEFAUT.
// Une nuit isolée dont l'arrivée (ou le départ du lendemain) est interdite garde sa valeur normale.
export function nuitsMinVoulues(params: {
  jours: Beds24CalendarDay[];
  debut: string;
  fin: string;
  pricelabs: Map<string, number | null>;
  manuelles: Map<string, number>;
  parDefaut?: number;
}): { voulu: Map<string, { minStay: number; source: SourceNuitsMin }>; ecarts: EcartAnalyse[] } {
  const parDefaut = params.parDefaut ?? NUITS_MIN_PAR_DEFAUT;
  const parDate = new Map(params.jours.map((j) => [j.date, j]));
  const voulu = new Map<string, { minStay: number; source: SourceNuitsMin }>();

  const base = (date: string): { minStay: number; source: SourceNuitsMin } => {
    const manuel = params.manuelles.get(date);
    if (manuel != null && manuel >= 1) return { minStay: manuel, source: "manuel" };
    const pl = params.pricelabs.get(date);
    if (pl != null && pl >= 1) return { minStay: Math.round(pl), source: "pricelabs" };
    return { minStay: parDefaut, source: "defaut" };
  };

  for (let d = params.debut; d <= params.fin; d = ajouterJours(d, 1)) voulu.set(d, base(d));

  const ecarts: EcartAnalyse[] = [];
  for (const ecart of ecartsLibres(params.jours, params.debut, params.fin)) {
    const nuits = ecart.dates.length;
    const b = voulu.get(ecart.debut)?.minStay ?? parDefaut;
    if (nuits >= b) continue; // écart assez long pour être réservé normalement
    const premiere = parDate.get(ecart.debut);
    const lendemain = parDate.get(ajouterJours(ecart.dates[nuits - 1], 1));
    const arriveeInterdite = premiere?.override === "noCheckIn" || premiere?.override === "noCheckInOrCheckOut";
    const departInterdit = lendemain?.override === "noCheckOut" || lendemain?.override === "noCheckInOrCheckOut";
    ecarts.push({ debut: ecart.debut, dates: ecart.dates, nuits, base: b, arriveeInterdite, departInterdit });
    if (arriveeInterdite || departInterdit) continue;
    for (const d of ecart.dates) {
      const v = voulu.get(d);
      if (!v || v.source === "manuel") continue; // un choix manuel n'est jamais écrasé
      if (v.minStay > nuits) voulu.set(d, { minStay: nuits, source: "isolee" });
    }
  }
  return { voulu, ecarts };
}
