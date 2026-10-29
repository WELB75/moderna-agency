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

// ---------- Niveaux de connaissance (section ludique de la page Mémoire de l'agent) ----------
//
// Kamel, 2026-10-26 : "des infos ludiques avec des pourcentages d'apprentissage qui augmenteront
// sur tous les sujets possibles liés à notre activité". Chaque sujet est un thème concret de
// l'activité (arrivée tardive, piscine, cuisinière, caution...). Le pourcentage est calculé sur de
// vraies données : combien d'échanges réels (questions de voyageurs et réponses de l'équipe)
// parlent du sujet, et combien de fiches actives le couvrent. Rien n'est inventé : sans donnée, 0 %.

export type CategorieSujet = "arrivee" | "logement" | "services" | "argent" | "regles" | "reservation" | "problemes" | "equipe";

export const CATEGORIES_SUJETS: { code: CategorieSujet; libelle: string }[] = [
  { code: "arrivee", libelle: "Arrivée, départ et accès" },
  { code: "logement", libelle: "Logement et équipements" },
  { code: "services", libelle: "Services et sorties" },
  { code: "argent", libelle: "Argent" },
  { code: "regles", libelle: "Règles de la maison" },
  { code: "reservation", libelle: "Réservation" },
  { code: "problemes", libelle: "Problèmes et urgences" },
  { code: "equipe", libelle: "Façon de répondre" },
];

type Sujet = { code: string; libelle: string; categorie: CategorieSujet; mots: string[]; theme?: string };

export const SUJETS: Sujet[] = [
  { code: "arrivee_tardive", libelle: "Heure d'arrivée et arrivée tardive", categorie: "arrivee", mots: ["arrivee tardive", "arrive tard", "apres minuit", "tard le soir", "heure d arrivee", "arrivee anticipee", "arrivee tot", "check in", "checkin", "vol arrive", "atterri"] },
  { code: "depart_tardif", libelle: "Heure de départ et départ tardif", categorie: "arrivee", mots: ["depart tardif", "late check", "heure de depart", "check out", "checkout", "liberer le logement", "partir plus tard", "depart"] },
  { code: "cles_acces", libelle: "Remise des clés et accès au logement", categorie: "arrivee", mots: ["cle", "boitier", "serrure", "digicode", "code d acces", "acces au logement", "remise des cles", "porte d entree"] },
  { code: "trouver_logement", libelle: "Trouver le logement (route, GPS, domaine)", categorie: "arrivee", mots: ["localisation", "adresse", "gps", "maps", "waze", "itineraire", "comment arriver", "domaine", "gardien", "residence", "entree du"] },
  { code: "wifi", libelle: "Wifi et internet", categorie: "logement", mots: ["wifi", "internet", "connexion", "fibre", "reseau"] },
  { code: "clim_chauffage", libelle: "Climatisation et chauffage", categorie: "logement", mots: ["climatisation", "clim", "chauffage", "temperature", "radiateur", "cheminee", "il fait froid", "il fait chaud"] },
  { code: "piscine", libelle: "Piscine", categorie: "logement", mots: ["piscine", "baignade", "nager", "bassin", "chauffee"] },
  { code: "linge", libelle: "Linge, draps et serviettes", categorie: "logement", mots: ["linge", "draps", "serviette", "literie", "couette", "oreiller", "couverture"] },
  { code: "cuisine_electro", libelle: "Cuisine et électroménager", categorie: "logement", mots: ["cuisine equipee", "le four", "lave vaisselle", "machine a laver", "lave linge", "seche", "ustensile", "casserole", "cafetiere", "frigo"] },
  { code: "exterieur", libelle: "Jardin, terrasse et barbecue", categorie: "logement", mots: ["jardin", "terrasse", "barbecue", "salon de jardin", "transat", "exterieur", "toit", "rooftop"] },
  { code: "cuisiniere", libelle: "Cuisinière et repas", categorie: "services", mots: ["cuisiniere", "chef", "repas", "petit dejeuner", "dejeuner", "diner", "cuisine marocaine", "tajine", "carte des repas"] },
  { code: "courses", libelle: "Courses et coursier", categorie: "services", mots: ["courses", "supermarche", "produits", "coursier", "provisions", "carrefour", "marjane"] },
  { code: "menage", libelle: "Ménage et nettoyage", categorie: "services", mots: ["menage", "nettoyage", "femme de menage", "propre", "nettoyer", "poubelle"] },
  { code: "transferts", libelle: "Transferts, taxi et voiture", categorie: "services", mots: ["transfert", "aeroport", "taxi", "chauffeur", "navette", "location de voiture", "voiture", "uber", "indrive"] },
  { code: "activites", libelle: "Activités, hammam et excursions", categorie: "services", mots: ["hammam", "massage", "spa", "quad", "desert", "excursion", "activite", "montgolfiere", "cours de cuisine", "atlas", "essaouira", "ourika", "agafay"] },
  { code: "sorties", libelle: "Restaurants, souks et bonnes adresses", categorie: "services", mots: ["restaurant", "sortie", "souk", "medina", "jemaa", "que faire", "a visiter", "bonnes adresses", "boite de nuit", "shopping"] },
  { code: "bebe_enfants", libelle: "Bébés et enfants", categorie: "services", mots: ["bebe", "lit bebe", "enfant", "chaise haute", "poussette", "parc bebe", "lit d appoint", "lit supplementaire"] },
  { code: "caution", libelle: "Caution et empreinte bancaire", categorie: "argent", mots: ["caution", "depot de garantie", "empreinte", "garantie", "preautorisation"] },
  { code: "paiement", libelle: "Paiement, tarifs et factures", categorie: "argent", mots: ["paiement", "payer", "carte bancaire", "especes", "virement", "acompte", "facture", "tarif", "prix", "devis", "dirham", "supplement"] },
  { code: "remboursement", libelle: "Remboursement et réclamations", categorie: "argent", mots: ["remboursement", "rembourser", "litige", "plainte", "compensation", "geste commercial", "reclamation", "insatisf"] },
  { code: "bruit_fetes", libelle: "Bruit, fêtes et voisinage", categorie: "regles", mots: ["bruit", "fete", "soiree", "musique", "dj", "tapage", "voisin", "anniversaire", "enterrement de vie"] },
  { code: "visiteurs", libelle: "Visiteurs et nombre de voyageurs", categorie: "regles", mots: ["visiteur", "invite", "personne supplementaire", "nombre de voyageurs", "capacite", "amis", "famille qui", "combien de personnes"] },
  { code: "animaux_fumeurs", libelle: "Animaux et fumeurs", categorie: "regles", mots: ["animal", "animaux", "chien", "chat", "fumer", "fumeur", "cigarette", "shisha", "chicha"] },
  { code: "documents", libelle: "Documents et fiche de police", categorie: "regles", mots: ["passeport", "fiche de police", "fiche police", "piece d identite", "document", "livret de famille", "couple", "carte d identite"] },
  { code: "modification", libelle: "Changer ou prolonger les dates", categorie: "reservation", mots: ["modifier", "changement de date", "decaler", "prolonger", "rallonger", "raccourcir", "changer les dates", "une nuit de plus"] },
  { code: "annulation", libelle: "Annulation", categorie: "reservation", mots: ["annul", "politique d annulation", "no show", "ne viendra pas", "empeche"] },
  { code: "disponibilites", libelle: "Disponibilités et promotions", categorie: "reservation", mots: ["disponib", "dates libres", "saison", "reduction", "promo", "remise", "long sejour", "meilleur prix", "dernier moment"] },
  { code: "groupes", libelle: "Groupes et événements", categorie: "reservation", mots: ["groupe", "evenement", "mariage", "seminaire", "tournage", "shooting", "reunion", "retraite"] },
  { code: "pannes", libelle: "Pannes et réparations", categorie: "problemes", mots: ["panne", "ne marche pas", "ne fonctionne pas", "casse", "fuite", "plomberie", "electricite", "coupure", "eau chaude", "reparer", "technicien", "probleme avec"] },
  { code: "objets_perdus", libelle: "Objets oubliés ou perdus", categorie: "problemes", mots: ["oublie", "perdu", "objet", "retrouve", "laisse dans"] },
  { code: "securite_medical", libelle: "Sécurité, urgences et médecin", categorie: "problemes", mots: ["urgence", "medecin", "pharmacie", "hopital", "cambriolage", "appeler la police", "accident", "malade", "ambulance", "danger"] },
  { code: "ton_equipe", libelle: "Ton et façon d'écrire de l'équipe", categorie: "equipe", mots: [], theme: "style" },
];

export type NiveauConnaissance = "A découvrir" | "Débutant" | "Apprenti" | "Confirmé" | "Expert" | "Maître";

export function niveauPourPct(pct: number): NiveauConnaissance {
  if (pct <= 0) return "A découvrir";
  if (pct < 25) return "Débutant";
  if (pct < 50) return "Apprenti";
  if (pct < 75) return "Confirmé";
  if (pct < 95) return "Expert";
  return "Maître";
}

export type ConnaissanceSujet = {
  code: string;
  libelle: string;
  categorie: CategorieSujet;
  pct: number;
  niveau: NiveauConnaissance;
  echanges: number;
  fiches: number;
  cetteSemaine: number; // échanges sur ce sujet appris ces 7 derniers jours
  // Sujets qui reposent aussi sur les données saisies sur les logements (wifi, clés, localisation,
  // équipements décrits) : combien de logements sont renseignés. null = sujet sans donnée de ce type.
  logements: { renseignes: number; total: number } | null;
  // Règle de l'agence déjà intégrée à l'agent (caution, ménage, cuisinière...), indépendamment des conversations.
  integre: boolean;
};

export type Connaissances = {
  sujets: ConnaissanceSujet[];
  global: number;
  maitrises: number; // sujets à 75 % ou plus
  cetteSemaine: number; // échanges appris ces 7 derniers jours, tous sujets confondus
  aEnrichir: ConnaissanceSujet[]; // sujets les moins connus
};

function normaliser(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`-]/g, " ");
}

function compilerMots(mots: string[]): RegExp | null {
  if (mots.length === 0) return null;
  const alternatives = mots.map((m) => normaliser(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Frontière au début seulement : "annul" couvre "annulation", mais "dj" ne couvre pas "adjoint".
  return new RegExp(`(?<![a-z0-9])(?:${alternatives.join("|")})`);
}

// Ce que l'app sait de chaque logement (fiche du logement), pour mesurer ce que l'agent connaît
// au-delà des conversations : un code wifi saisi sur la fiche est une connaissance de l'agent.
export type LogementConnu = {
  nom: string;
  wifi: boolean;
  boitier: boolean;
  porte: boolean;
  localisation: boolean; // lien Maps/Waze du domaine ou adresse du logement
  description: string | null;
};

// Règles de l'agence déjà écrites dans le prompt de l'agent (voir suggestion.ts) : montant de la
// caution, frais de ménage, tarifs de la cuisinière, piscine chauffée, horaires d'arrivée/départ.
const CONNAISSANCE_INTEGREE: Record<string, number> = {
  caution: 1,
  menage: 1,
  cuisiniere: 1,
  piscine: 0.4,
  arrivee_tardive: 0.3,
  depart_tardif: 0.3,
};

// Sujets "équipement" mesurés par la description des logements.
const SUJETS_DESCRIPTION = new Set(["piscine", "clim_chauffage", "linge", "cuisine_electro", "exterieur"]);

export type EchangeConnu = { question: string; reponse: string; at: Date | string | null };
export type FicheConnue = { theme: string; titre: string; question: string; reponse: string; epingle?: boolean };

// Part d'un échange réel (0 à 1) : plus il y en a sur un sujet, plus l'agent le connaît, avec un
// rendement décroissant (5 échanges = 63 %, 10 = 86 %). Les fiches complètent : sans fiche rédigée
// (ou validée à la main), un sujet plafonne à 60 %.
export function calculerConnaissances(fiches: FicheConnue[], echanges: EchangeConnu[], maintenant = new Date(), logements: LogementConnu[] = []): Connaissances {
  const il_y_a_7_jours = maintenant.getTime() - 7 * 24 * 3600 * 1000;
  const echangesNormalises = echanges.map((e) => ({ texte: normaliser(`${e.question} ${e.reponse}`), recent: e.at ? new Date(e.at).getTime() >= il_y_a_7_jours : false }));
  const fichesNormalisees = fiches.map((f) => ({ ...f, texte: normaliser(`${f.titre} ${f.question} ${f.reponse}`) }));

  const sujets: ConnaissanceSujet[] = SUJETS.map((s) => {
    const re = compilerMots(s.mots);
    const nbEchanges = re ? echangesNormalises.filter((e) => re.test(e.texte)).length : 0;
    const recents = re ? echangesNormalises.filter((e) => e.recent && re.test(e.texte)).length : 0;
    const nbFiches = fichesNormalisees
      .filter((f) => (s.theme ? f.theme === s.theme : Boolean(re && re.test(f.texte))))
      .reduce((total, f) => total + (f.epingle ? 1.5 : 1), 0);
    const echantillon = s.theme ? Math.min(1, nbFiches) : 1 - Math.exp(-nbEchanges / 5);
    const couverture = Math.min(1, nbFiches / 2);

    // Données saisies sur les logements (wifi, clés, localisation, équipements décrits).
    let couvertureLogements: number | null = null;
    if (logements.length > 0) {
      const parLogement = (note: (l: LogementConnu) => number) => logements.reduce((t, l) => t + note(l), 0);
      if (s.code === "wifi") couvertureLogements = parLogement((l) => (l.wifi ? 1 : 0));
      else if (s.code === "cles_acces") couvertureLogements = parLogement((l) => (l.boitier ? 0.5 : 0) + (l.porte ? 0.5 : 0));
      else if (s.code === "trouver_logement") couvertureLogements = parLogement((l) => (l.localisation ? 1 : 0));
      else if (SUJETS_DESCRIPTION.has(s.code) && re) couvertureLogements = parLogement((l) => (l.description && re.test(normaliser(l.description)) ? 1 : 0));
    }
    const integree = CONNAISSANCE_INTEGREE[s.code] ?? null;
    const structure = couvertureLogements === null && integree === null ? null : Math.max(couvertureLogements === null ? 0 : couvertureLogements / logements.length, integree ?? 0);

    let pct: number;
    if (s.theme) pct = Math.round(100 * couverture);
    else if (structure === null) pct = Math.min(100, Math.round(100 * (0.6 * echantillon + 0.4 * couverture)));
    else pct = Math.min(100, Math.round(100 * (0.3 * echantillon + 0.2 * couverture + 0.5 * structure)));

    return {
      code: s.code,
      libelle: s.libelle,
      categorie: s.categorie,
      pct,
      niveau: niveauPourPct(pct),
      echanges: nbEchanges,
      fiches: Math.floor(nbFiches),
      cetteSemaine: recents,
      logements: couvertureLogements === null ? null : { renseignes: Math.round(couvertureLogements), total: logements.length },
      integre: integree !== null,
    };
  });

  const global = Math.round(sujets.reduce((t, s) => t + s.pct, 0) / sujets.length);
  return {
    sujets,
    global,
    maitrises: sujets.filter((s) => s.pct >= 75).length,
    cetteSemaine: echangesNormalises.filter((e) => e.recent).length,
    aEnrichir: [...sujets].sort((a, b) => a.pct - b.pct).slice(0, 3),
  };
}
