// Statistiques de l'onglet Avis : tout est calculé en JS à partir de la liste des avis (quelques
// centaines au plus). Note unifiée = moyenne des notes ramenées sur 10 (Airbnb × 2), donc
// pondérée par le nombre d'avis de chaque plateforme. Fichier sans import : testé avec node --test.

export type AvisStat = {
  source: "airbnb" | "booking";
  note10: number;
  villaId: string | null;
  publieAt: Date | null;
  reponse: string | null;
  masque: boolean;
  detail: { cle: string; note10: number }[];
};

export type LogementAvis = { id: string; nom: string; type: string | null; domaine: string | null };

export const arrondi1 = (n: number) => Math.round(n * 10) / 10;

export function moyenne(valeurs: number[]): number | null {
  return valeurs.length === 0 ? null : arrondi1(valeurs.reduce((s, v) => s + v, 0) / valeurs.length);
}

export type ResumeAvis = {
  n: number;
  moyenne10: number | null;
  airbnb: { n: number; moyenne5: number | null };
  booking: { n: number; moyenne10: number | null };
  sansReponse: number;
  tauxReponse: number | null; // % d'avis ayant une réponse
};

export function resumer(avis: AvisStat[]): ResumeAvis {
  const visibles = avis.filter((a) => !a.masque);
  const air = visibles.filter((a) => a.source === "airbnb");
  const boo = visibles.filter((a) => a.source === "booking");
  const sansReponse = visibles.filter((a) => !a.reponse).length;
  const m5 = moyenne(air.map((a) => a.note10));
  return {
    n: visibles.length,
    moyenne10: moyenne(visibles.map((a) => a.note10)),
    airbnb: { n: air.length, moyenne5: m5 === null ? null : arrondi1(m5 / 2) },
    booking: { n: boo.length, moyenne10: moyenne(boo.map((a) => a.note10)) },
    sansReponse,
    tauxReponse: visibles.length === 0 ? null : Math.round(((visibles.length - sansReponse) / visibles.length) * 100),
  };
}

const JOUR = 24 * 60 * 60 * 1000;

export type LigneLogement = ResumeAvis & {
  villaId: string;
  nom: string;
  type: string | null;
  domaine: string | null;
  tendance: number | null; // moyenne des 90 derniers jours moins celle des 90 jours d'avant (sur 10)
};

export function parLogement(avis: AvisStat[], logements: LogementAvis[], now: Date): LigneLogement[] {
  return logements.map((l) => {
    const siens = avis.filter((a) => a.villaId === l.id);
    const t = now.getTime();
    const recents = siens.filter((a) => !a.masque && a.publieAt && t - a.publieAt.getTime() <= 90 * JOUR).map((a) => a.note10);
    const avant = siens
      .filter((a) => !a.masque && a.publieAt && t - a.publieAt.getTime() > 90 * JOUR && t - a.publieAt.getTime() <= 180 * JOUR)
      .map((a) => a.note10);
    const mr = moyenne(recents);
    const ma = moyenne(avant);
    return { ...resumer(siens), villaId: l.id, nom: l.nom, type: l.type, domaine: l.domaine, tendance: mr !== null && ma !== null ? arrondi1(mr - ma) : null };
  });
}

// Répartition par « étoiles » (note sur 10 ramenée à 1-5) : 5 = 9 et plus, 4 = 7 à 8,9, etc.
export function repartition(avis: AvisStat[]): { etoiles: number; n: number }[] {
  const compte = [0, 0, 0, 0, 0];
  for (const a of avis) {
    if (a.masque) continue;
    const e = Math.min(5, Math.max(1, Math.round(a.note10 / 2)));
    compte[e - 1]++;
  }
  return [5, 4, 3, 2, 1].map((etoiles) => ({ etoiles, n: compte[etoiles - 1] }));
}

export function moyennesParCategorie(avis: AvisStat[]): { cle: string; moyenne10: number; n: number }[] {
  const acc = new Map<string, number[]>();
  for (const a of avis) {
    if (a.masque) continue;
    for (const d of a.detail) acc.set(d.cle, [...(acc.get(d.cle) ?? []), d.note10]);
  }
  return [...acc.entries()]
    .map(([cle, v]) => ({ cle, moyenne10: moyenne(v) ?? 0, n: v.length }))
    .sort((x, y) => x.moyenne10 - y.moyenne10);
}

// 12 derniers mois (le plus ancien d'abord), même les mois sans avis.
export function parMois(avis: AvisStat[], now: Date): { mois: string; n: number; moyenne10: number | null }[] {
  const sortie: { mois: string; n: number; moyenne10: number | null }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const cle = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const du = avis.filter((a) => !a.masque && a.publieAt && a.publieAt.toISOString().slice(0, 7) === cle);
    sortie.push({ mois: cle, n: du.length, moyenne10: moyenne(du.map((a) => a.note10)) });
  }
  return sortie;
}

export const SEUIL_AVIS_BAS = 6; // 6/10 = 3/5 et en dessous

export type AvisATraiter = { note10: number; reponse: string | null; publieAt: Date | null; masque: boolean };

// Avis à traiter : mauvaise note des 30 derniers jours, ou avis sans réponse depuis plus de 48 h
// (sur 60 jours, pour ne pas ressortir tout l'historique).
export function aTraiter<T extends AvisATraiter>(avis: T[], now: Date): { bas: T[]; sansReponse: T[] } {
  const t = now.getTime();
  const bas = avis.filter((a) => !a.masque && a.note10 <= SEUIL_AVIS_BAS && a.publieAt && t - a.publieAt.getTime() <= 30 * JOUR);
  const sansReponse = avis.filter(
    (a) => !a.masque && !a.reponse && a.publieAt && t - a.publieAt.getTime() > 2 * JOUR && t - a.publieAt.getTime() <= 60 * JOUR
  );
  return { bas, sansReponse };
}
