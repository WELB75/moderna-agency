// Recherche d'un logement par son nom, telle que Kamel l'écrit à l'assistant Telegram.
// Avant : simple « contient », donc « Eva cosy » tombait sur « Maeva Cosy » (mauvais code donné)
// et « Wimillim » / « Lilas » (orthographe de la feuille de route) ne trouvaient ni Wimiliim ni Lila.
// Maintenant : correspondance exacte, puis par mots entiers, puis par faute de frappe proche.

export type LogementRecherche = { nom: string; numero: string };

export const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const MOTS_VIDES = new Set(["villa", "appartement", "appart", "apt", "cosy", "cozy", "le", "la", "de", "du", "n"]);

function mots(s: string): string[] {
  return sansAccent(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const coeur = (s: string) => mots(s).filter((m) => !MOTS_VIDES.has(m));

export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Tolérance selon la longueur : pas de faute admise sur un mot très court (évite Eva -> Maeva).
const tolerance = (n: number) => (n <= 3 ? 0 : n <= 9 ? 1 : 2);

export function trouverLogement<T extends LogementRecherche>(liste: T[], recherche: string): T[] {
  const q = sansAccent(recherche);
  if (!q) return [];

  const numero = q.replace(/^n°?\s*/, "");
  const exact = liste.filter((v) => sansAccent(v.nom) === q || v.numero === numero);
  if (exact.length) return exact;

  const qc = coeur(recherche);
  if (qc.length === 0) return [];

  // Mots entiers : tous les mots utiles de la demande figurent dans le nom, ou l'inverse.
  const parMots = liste.filter((v) => {
    const nc = coeur(v.nom);
    if (nc.length === 0) return false;
    return qc.every((m) => nc.includes(m)) || nc.every((m) => qc.includes(m));
  });
  if (parMots.length) return parMots;

  // Faute de frappe : le mot demandé est proche d'un mot du nom (Wimillim ~ Wimiliim, Lilas ~ Lila).
  const scores = liste
    .map((v) => {
      const nc = coeur(v.nom);
      const ds = qc.flatMap((m) => nc.map((n) => (distance(m, n) <= tolerance(Math.min(m.length, n.length)) ? distance(m, n) : Infinity)));
      return { v, d: ds.length ? Math.min(...ds) : Infinity };
    })
    .filter((x) => x.d !== Infinity);
  if (scores.length === 0) return [];
  const mini = Math.min(...scores.map((x) => x.d));
  return scores.filter((x) => x.d === mini).map((x) => x.v);
}
