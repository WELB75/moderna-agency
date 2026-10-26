// Règles pures de la mémoire de l'agent IA de la boîte de réception (voir memoire.ts) : thèmes,
// anonymisation des échanges avant stockage, et mise en forme des fiches pour le prompt. Aucune
// dépendance serveur : testable telle quelle.
//
// Kamel, 2026-10-26 : "reprendre tout ce que les clients disent, demandent et ce qu'on leur
// répond pour alimenter la mémoire de l'agent IA".

export const THEMES = [
  { code: "arrivee_depart", libelle: "Arrivée et départ (horaires, remise des clés)" },
  { code: "acces_localisation", libelle: "Accès et localisation (route, domaine, sécurité à l'entrée)" },
  { code: "equipements_wifi", libelle: "Équipements, wifi, climatisation, linge" },
  { code: "piscine_exterieur", libelle: "Piscine, jardin, terrasse" },
  { code: "cuisiniere_repas", libelle: "Cuisinière, repas, courses" },
  { code: "menage", libelle: "Ménage et services pendant le séjour" },
  { code: "caution_paiement", libelle: "Caution, paiement, factures" },
  { code: "transport_activites", libelle: "Transferts, taxis, activités, conseils sur Marrakech" },
  { code: "famille_enfants", libelle: "Enfants, bébés, lit bébé" },
  { code: "regles_maison", libelle: "Règles de la maison (bruit, fêtes, visiteurs, animaux, fumeurs)" },
  { code: "probleme_sur_place", libelle: "Problème sur place (panne, fuite, équipement cassé)" },
  { code: "reservation_modification", libelle: "Réservation, dates, nombre de voyageurs, annulation" },
  { code: "style", libelle: "Style de l'équipe (ton, formules, signature)" },
  { code: "autre", libelle: "Autre" },
] as const;

export type ThemeCode = (typeof THEMES)[number]["code"];

// "style" est réservé à la consolidation (jamais extrait d'un fil).
export const THEMES_EXTRACTION = THEMES.filter((t) => t.code !== "style").map((t) => t.code);

export function libelleTheme(code: string): string {
  return THEMES.find((t) => t.code === code)?.libelle ?? code;
}

export type FicheMemoire = {
  id: string;
  theme: string;
  titre: string;
  question: string;
  reponse: string;
  villaNom: string | null; // null = valable pour tous les logements
  nbSources: number;
};

const MOTS_NEUTRES = new Set(["villa", "appartement", "monsieur", "madame", "mme", "mrs", "the", "les", "des", "van", "von", "ben", "bin", "del", "dos", "das", "ould", "abou"]);

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Retire d'un texte tout ce qui ne doit jamais entrer dans une mémoire partagée entre voyageurs :
// emails, liens, numéros de téléphone, codes (digicode, boîtier, wifi...) et noms du voyageur.
// Les prix ("1000 €", "300 MAD") et les années sont conservés.
export function anonymiser(texte: string, nomsVoyageur: string[] = []): string {
  let t = texte;
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]");
  t = t.replace(/(?:https?:\/\/|www\.)\S+/gi, "[lien]");
  t = t.replace(/(?:\+|00)?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[téléphone]" : m));
  t = t.replace(/\b\d{4,8}\b(?!\s?(?:€|eur|euros?|mad|dh|dhs|dirhams?|usd|\$))/gi, (m) => (/^(19|20)\d{2}$/.test(m) ? m : "[code]"));
  for (const brut of nomsVoyageur) {
    for (const mot of brut.split(/[\s,;/-]+/)) {
      const m = mot.trim();
      if (m.length < 3 || MOTS_NEUTRES.has(m.toLowerCase())) continue;
      t = t.replace(new RegExp(`(?<![\\p{L}])${echapper(m)}(?![\\p{L}])`, "giu"), "[prénom]");
    }
  }
  return t;
}

// Bloc ajouté au prompt de l'agent : fiches générales + celles du logement du séjour, les plus
// confirmées d'abord, dans la limite d'un budget de caractères.
export function blocMemoire(fiches: FicheMemoire[], villaNom: string | null, budget = 20000): string {
  const pertinentes = fiches
    .filter((f) => !f.villaNom || (villaNom && f.villaNom.toLowerCase() === villaNom.toLowerCase()))
    .sort((a, b) => Number(Boolean(b.villaNom)) - Number(Boolean(a.villaNom)) || b.nbSources - a.nbSources);
  if (pertinentes.length === 0) return "";

  const lignes: string[] = [];
  let total = 0;
  for (const f of pertinentes) {
    const bloc =
      `[${libelleTheme(f.theme)}] ${f.titre}${f.villaNom ? ` (spécifique à ${f.villaNom})` : ""}\n` +
      `Question habituelle : ${f.question}\nRéponse habituelle de l'équipe : ${f.reponse}`;
    if (total + bloc.length > budget) break;
    lignes.push(bloc);
    total += bloc.length;
  }
  return lignes.join("\n\n");
}
