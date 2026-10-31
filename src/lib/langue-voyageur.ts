// Détection de la langue d'un voyageur d'après ce qu'il a écrit (Fouad, 2026-10-31 : « j'aimerais
// que le système sache direct, au vu des messages précédents avec la cliente, sa langue, comme ça
// on envoie en français si elle écrit en français ou en anglais »).
//
// Heuristique locale (pas d'appel IA, pour répondre au clic sans attendre) : on compte les mots
// très fréquents de chaque langue dans les derniers messages du voyageur, les plus récents pesant
// plus lourd. L'arabe se reconnaît à son alphabet. Suffisant pour « français ou pas français »,
// qui est ce que les modèles de messages savent faire (MessageLang = fr | en) ; les autres langues
// détectées (es, nl, de, it, pt) basculent sur l'anglais.

export type LangueDetectee = "fr" | "en" | "es" | "nl" | "de" | "it" | "pt" | "ar";

const MOTS: Record<Exclude<LangueDetectee, "ar">, string[]> = {
  fr: ["le", "la", "les", "des", "une", "est", "et", "pour", "nous", "vous", "bonjour", "merci", "avec", "pas", "sommes", "arrivée", "arrivons", "serons", "svp", "bonsoir", "oui", "notre", "votre", "dans", "sur", "à", "ça", "très", "bien", "je", "on", "aussi", "heure", "demain", "soir", "matin"],
  en: ["the", "and", "we", "you", "will", "are", "is", "for", "with", "thanks", "thank", "hello", "hi", "please", "our", "your", "arrive", "arriving", "check", "at", "be", "have", "can", "would", "there", "what", "time", "tomorrow", "evening", "morning", "it", "this", "that"],
  es: ["hola", "gracias", "nosotros", "llegamos", "llegaremos", "por", "favor", "para", "con", "una", "las", "los", "del", "está", "estamos", "mañana", "noche", "buenos", "buenas", "también", "muy", "nuestro", "qué", "hay"],
  nl: ["wij", "we", "bedankt", "dank", "hallo", "goedemorgen", "goedemiddag", "komen", "aankomst", "het", "een", "niet", "voor", "met", "van", "zijn", "ook", "graag", "morgen", "avond", "onze", "jullie", "alvast"],
  de: ["wir", "danke", "hallo", "ankunft", "kommen", "und", "nicht", "mit", "für", "das", "die", "der", "sind", "auch", "bitte", "morgen", "abend", "unsere", "ihr", "sie", "guten", "tag", "uhr"],
  it: ["ciao", "grazie", "noi", "arriviamo", "arriveremo", "per", "con", "una", "della", "sono", "siamo", "anche", "domani", "sera", "mattina", "buongiorno", "buonasera", "nostro", "molto", "prego"],
  pt: ["olá", "obrigado", "obrigada", "nós", "chegamos", "chegaremos", "para", "com", "uma", "não", "está", "estamos", "também", "amanhã", "noite", "manhã", "bom", "boa", "nosso", "muito"],
};

const ARABE = /[؀-ۿ]/;

function tokens(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^\p{L}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 0);
}

export type ResultatLangue = { langue: LangueDetectee; score: number; nbMessages: number };

// `messages` : textes écrits PAR le voyageur, du plus ancien au plus récent. null si rien
// d'exploitable (aucun message, ou aucun mot reconnu).
export function detecterLangue(messages: string[]): ResultatLangue | null {
  const utiles = messages.map((m) => m.trim()).filter((m) => m.length > 0);
  if (utiles.length === 0) return null;
  const recents = utiles.slice(-12);
  const scores = new Map<LangueDetectee, number>();
  let total = 0;
  recents.forEach((texte, i) => {
    // Le dernier message pèse 1, le plus ancien ~0.4.
    const poids = 0.4 + (0.6 * (i + 1)) / recents.length;
    if (ARABE.test(texte)) {
      const n = (texte.match(/[؀-ۿ]+/g) ?? []).length;
      scores.set("ar", (scores.get("ar") ?? 0) + n * poids);
      total += n * poids;
    }
    const mots = tokens(texte);
    for (const langue of Object.keys(MOTS) as (keyof typeof MOTS)[]) {
      const liste = MOTS[langue];
      let n = 0;
      for (const mot of mots) if (liste.includes(mot)) n++;
      if (n > 0) {
        scores.set(langue, (scores.get(langue) ?? 0) + n * poids);
        total += n * poids;
      }
    }
  });
  if (scores.size === 0 || total === 0) return null;
  let meilleure: LangueDetectee = "fr";
  let max = -1;
  for (const [langue, score] of scores) {
    if (score > max) {
      max = score;
      meilleure = langue;
    }
  }
  return { langue: meilleure, score: Math.round((max / total) * 100) / 100, nbMessages: utiles.length };
}

// Langue des modèles de messages de l'app (fr | en) d'après la langue détectée.
export function langueMessage(langue: LangueDetectee | null | undefined): "fr" | "en" {
  return langue === "fr" ? "fr" : langue ? "en" : "fr";
}

export const NOMS_LANGUES: Record<LangueDetectee, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  nl: "néerlandais",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  ar: "arabe",
};
