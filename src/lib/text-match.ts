// Normalise (minuscules, accents retires) puis exige que chaque mot de la requete soit trouve
// quelque part dans le texte cible -- recherche multi-mots (ex. "villa sofya" ou "petit dej")
// plutot qu une simple sous-chaine exacte, insensible aux accents ("menage" trouve "menage").
const DIACRITICS_RE = /[̀-ͯ]/g;

function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

export function matchesSearch(haystack: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const h = normalizeSearch(haystack);
  return words.every((w) => h.includes(w));
}
