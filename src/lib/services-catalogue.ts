// Catalogue des services proposés au voyageur sur son lien /sejour/[id] (2026-11-18) : repris de la
// brochure Moderna (activités, expériences, conciergerie, événements), plus les services à la
// villa. Le voyageur coche, choisit le jour, l'heure et le nombre de personnes ; l'équipe confirme.
// Tarifs (2026-11-18) : valeurs INVENTÉES pour la simulation, en MAD, avec équivalent en euros
// (taux fixe 10 MAD = 1 EUR, comme dans le reste de l'app). À remplacer par les vrais prix.
export type ServiceIcone =
  | "bike" | "footprints" | "mountain" | "sunrise" | "wind" | "tent" | "waves" | "compass"
  | "horse" | "chef" | "palette" | "spa" | "hand" | "flame" | "map" | "landmark"
  | "plane" | "car" | "basket" | "calendar" | "scissors" | "coffee" | "utensils" | "sparkles"
  | "cake" | "party" | "heart" | "camera" | "music" | "gift" | "flower" | "wine" | "clipboard" | "users";

export type CategorieService = "villa" | "activites" | "experiences" | "conciergerie" | "evenements";

export type ServiceCatalogue = {
  key: string;
  categorie: CategorieService;
  icone: ServiceIcone;
  fr: string;
  en: string;
};

export const CATEGORIES_SERVICES: { key: CategorieService; fr: string; en: string; description: { fr: string; en: string } }[] = [
  { key: "villa", fr: "À la villa", en: "At the villa", description: { fr: "Repas, ménage et courses, directement chez vous.", en: "Meals, housekeeping and groceries, right at your villa." } },
  { key: "activites", fr: "Activités et excursions", en: "Activities & excursions", description: { fr: "Aventure, nature et paysages autour de Marrakech.", en: "Adventure, nature and landscapes around Marrakech." } },
  { key: "experiences", fr: "Expériences authentiques", en: "Authentic experiences", description: { fr: "Savoir-faire, bien-être et culture marocaine.", en: "Craft, well-being and Moroccan culture." } },
  { key: "conciergerie", fr: "Conciergerie", en: "Concierge services", description: { fr: "Nous nous occupons de chaque détail.", en: "We take care of every detail." } },
  { key: "evenements", fr: "Événements et décoration", en: "Events & decoration", description: { fr: "Des moments inoubliables pour chaque occasion.", en: "Unforgettable moments for every occasion." } },
];

export const SERVICES: ServiceCatalogue[] = [
  // À la villa
  { key: "petit-dejeuner", categorie: "villa", icone: "coffee", fr: "Petit-déjeuner marocain", en: "Moroccan breakfast" },
  { key: "dejeuner", categorie: "villa", icone: "utensils", fr: "Déjeuner (menu du jour)", en: "Lunch (menu of the day)" },
  { key: "couscous", categorie: "villa", icone: "chef", fr: "Couscous royal", en: "Royal couscous" },
  { key: "tajine", categorie: "villa", icone: "utensils", fr: "Tajine (poulet-citron, agneau-pruneaux ou légumes)", en: "Tagine (chicken-lemon, lamb-prunes or vegetable)" },
  { key: "pastilla", categorie: "villa", icone: "utensils", fr: "Pastilla au poulet", en: "Chicken pastilla" },
  { key: "mechoui", categorie: "villa", icone: "flame", fr: "Méchoui d'agneau (à partir de 4 personnes)", en: "Roast lamb mechoui (4 guests minimum)" },
  { key: "mezze", categorie: "villa", icone: "utensils", fr: "Salades marocaines et mezzés", en: "Moroccan salads & mezze" },
  { key: "patisseries", categorie: "villa", icone: "cake", fr: "Pâtisseries marocaines", en: "Moroccan pastries" },
  { key: "cuisiniere", categorie: "villa", icone: "chef", fr: "Cuisinière à la villa", en: "Private cook at the villa" },
  { key: "menage", categorie: "villa", icone: "sparkles", fr: "Ménage supplémentaire", en: "Extra housekeeping" },
  { key: "the-menthe", categorie: "villa", icone: "coffee", fr: "Thé à la menthe (théière)", en: "Mint tea (teapot)" },
  { key: "boissons", categorie: "villa", icone: "wine", fr: "Jus d'orange frais pressé", en: "Fresh orange juice" },
  { key: "pack-boissons", categorie: "villa", icone: "wine", fr: "Pack eau et sodas (12 bouteilles)", en: "Water & soft drinks pack (12 bottles)" },
  { key: "cocktails", categorie: "villa", icone: "wine", fr: "Cocktails sans alcool", en: "Mocktails" },
  // Activités et excursions
  { key: "quad-buggy", categorie: "activites", icone: "bike", fr: "Quad et buggy", en: "Quad & buggy" },
  { key: "dromadaire", categorie: "activites", icone: "footprints", fr: "Balade à dos de dromadaire", en: "Camel rides" },
  { key: "atlas", categorie: "activites", icone: "mountain", fr: "Excursions dans l'Atlas", en: "Atlas excursions" },
  { key: "montgolfiere", categorie: "activites", icone: "sunrise", fr: "Montgolfière", en: "Hot air balloon" },
  { key: "parapente", categorie: "activites", icone: "wind", fr: "Parapente", en: "Paragliding" },
  { key: "camp-desert", categorie: "activites", icone: "tent", fr: "Camp dans le désert", en: "Desert camp" },
  { key: "cascades", categorie: "activites", icone: "waves", fr: "Cascades et nature", en: "Waterfalls & nature" },
  { key: "autres-excursions", categorie: "activites", icone: "compass", fr: "Autres excursions", en: "Other excursions" },
  // Expériences authentiques
  { key: "cheval", categorie: "experiences", icone: "horse", fr: "Balade à cheval", en: "Horse riding" },
  { key: "cuisine-marocaine", categorie: "experiences", icone: "chef", fr: "Cours de cuisine marocaine", en: "Moroccan cooking classes" },
  { key: "poterie", categorie: "experiences", icone: "palette", fr: "Atelier de poterie", en: "Pottery workshop" },
  { key: "hammam-spa", categorie: "experiences", icone: "spa", fr: "Hammam et spa", en: "Hammam & spa" },
  { key: "massages", categorie: "experiences", icone: "hand", fr: "Massages et bien-être", en: "Massages & well-being" },
  { key: "bougies", categorie: "experiences", icone: "flame", fr: "Atelier de fabrication de bougies", en: "Candle making workshop" },
  { key: "immersions", categorie: "experiences", icone: "map", fr: "Immersions locales", en: "Local immersions" },
  { key: "art-culture", categorie: "experiences", icone: "landmark", fr: "Art et culture", en: "Art & culture" },
  // Conciergerie
  { key: "transfert-aeroport", categorie: "conciergerie", icone: "plane", fr: "Transfert aéroport", en: "Airport transfer" },
  { key: "chauffeur", categorie: "conciergerie", icone: "car", fr: "Chauffeur privé", en: "Private driver" },
  { key: "location-voiture", categorie: "conciergerie", icone: "car", fr: "Location de voiture", en: "Car rental" },
  { key: "livraison-courses", categorie: "conciergerie", icone: "basket", fr: "Livraison de courses", en: "Grocery delivery" },
  { key: "reservation-restaurant", categorie: "conciergerie", icone: "calendar", fr: "Réservation de restaurant ou d'activité", en: "Restaurant & activities booking" },
  { key: "hammam-domicile", categorie: "conciergerie", icone: "spa", fr: "Hammam et spa à la villa", en: "Hammam & spa at home" },
  { key: "coiffeur", categorie: "conciergerie", icone: "scissors", fr: "Coiffeur à la villa", en: "Hairdresser at home" },
  // Événements et décoration
  { key: "anniversaire", categorie: "evenements", icone: "cake", fr: "Anniversaire", en: "Birthday" },
  { key: "evjf", categorie: "evenements", icone: "party", fr: "EVJF et baby shower", en: "Bridal shower & bachelorette" },
  { key: "diner-prive", categorie: "evenements", icone: "utensils", fr: "Dîner privé", en: "Private dinner" },
  { key: "decoration-villa", categorie: "evenements", icone: "flower", fr: "Décoration de la villa", en: "Villa decoration" },
  { key: "mariage", categorie: "evenements", icone: "heart", fr: "Mariage et fiançailles", en: "Marriage & engagement" },
  { key: "surprise", categorie: "evenements", icone: "gift", fr: "Demande spéciale et surprise", en: "Special request & surprise" },
  { key: "organisation", categorie: "evenements", icone: "clipboard", fr: "Organisation et coordination complète", en: "Full planning & coordination" },
  { key: "traiteur", categorie: "evenements", icone: "chef", fr: "Traiteur et chef privé", en: "Catering & private chef" },
  { key: "animation", categorie: "evenements", icone: "music", fr: "Animation (DJ, musique…)", en: "Entertainment (DJ, music…)" },
  { key: "photo-video", categorie: "evenements", icone: "camera", fr: "Photographie et vidéo", en: "Photography & videography" },
  { key: "gateaux", categorie: "evenements", icone: "cake", fr: "Gâteaux et douceurs sur mesure", en: "Cake & sweets design" },
];

export const SERVICE_PAR_CLE = new Map(SERVICES.map((s) => [s.key, s]));

export const HEURE_FLEXIBLE = "flexible";

// Créneaux proposés : toutes les 30 minutes, de 07:00 à 23:30.
export const CRENEAUX: string[] = Array.from({ length: 34 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// ---------------------------------------------------------------------------------------------
// Tarifs indicatifs (inventés pour la simulation). mad = prix en dirhams.
// unite : "pers" (par personne, multiplié par le nombre choisi), "forfait" (prix fixe pour le
// groupe), "jour" (par jour), "offert". aPartirDe : prix minimum, le détail est confirmé sur devis.
// duree : mention affichée à côté du prix (facultatif).
// ---------------------------------------------------------------------------------------------
export type UnitePrix = "pers" | "forfait" | "jour" | "offert" | "devis";
export type Tarif = { mad: number; unite: UnitePrix; aPartirDe?: boolean; duree?: { fr: string; en: string } };

export const TAUX_MAD_PAR_EUR = 10;

export const TARIFS: Record<string, Tarif> = {
  // À la villa
  "petit-dejeuner": { mad: 120, unite: "pers" },
  dejeuner: { mad: 200, unite: "pers" },
  couscous: { mad: 220, unite: "pers" },
  tajine: { mad: 180, unite: "pers" },
  pastilla: { mad: 160, unite: "pers" },
  mechoui: { mad: 450, unite: "pers" },
  mezze: { mad: 90, unite: "pers" },
  patisseries: { mad: 80, unite: "pers" },
  cuisiniere: { mad: 400, unite: "jour", duree: { fr: "hors courses", en: "groceries not included" } },
  menage: { mad: 250, unite: "forfait" },
  "the-menthe": { mad: 60, unite: "forfait" },
  boissons: { mad: 45, unite: "pers" },
  "pack-boissons": { mad: 150, unite: "forfait" },
  cocktails: { mad: 70, unite: "pers" },
  // Activités et excursions
  "quad-buggy": { mad: 600, unite: "pers", duree: { fr: "2 h", en: "2 h" } },
  dromadaire: { mad: 350, unite: "pers", duree: { fr: "1 h, coucher de soleil", en: "1 h, sunset" } },
  atlas: { mad: 450, unite: "pers", duree: { fr: "journée", en: "full day" } },
  montgolfiere: { mad: 2200, unite: "pers", duree: { fr: "lever du soleil", en: "at sunrise" } },
  parapente: { mad: 1300, unite: "pers" },
  "camp-desert": { mad: 1400, unite: "pers", duree: { fr: "nuit et dîner", en: "night & dinner" } },
  cascades: { mad: 450, unite: "pers", duree: { fr: "journée", en: "full day" } },
  "autres-excursions": { mad: 0, unite: "devis" },
  // Expériences authentiques
  cheval: { mad: 500, unite: "pers", duree: { fr: "1 h 30", en: "1 h 30" } },
  "cuisine-marocaine": { mad: 550, unite: "pers", duree: { fr: "3 h, repas inclus", en: "3 h, meal included" } },
  poterie: { mad: 400, unite: "pers", duree: { fr: "2 h", en: "2 h" } },
  "hammam-spa": { mad: 450, unite: "pers" },
  massages: { mad: 600, unite: "pers", duree: { fr: "1 h", en: "1 h" } },
  bougies: { mad: 350, unite: "pers", duree: { fr: "2 h", en: "2 h" } },
  immersions: { mad: 400, unite: "pers" },
  "art-culture": { mad: 300, unite: "pers", duree: { fr: "visite guidée", en: "guided visit" } },
  // Conciergerie
  "transfert-aeroport": { mad: 250, unite: "forfait", duree: { fr: "jusqu'à 3 personnes", en: "up to 3 guests" } },
  chauffeur: { mad: 1200, unite: "jour", duree: { fr: "10 h, véhicule inclus", en: "10 h, vehicle included" } },
  "location-voiture": { mad: 400, unite: "jour", aPartirDe: true },
  "livraison-courses": { mad: 100, unite: "forfait", duree: { fr: "courses au prix coûtant", en: "groceries at cost" } },
  "reservation-restaurant": { mad: 0, unite: "offert" },
  "hammam-domicile": { mad: 700, unite: "pers" },
  coiffeur: { mad: 400, unite: "pers" },
  // Événements et décoration
  anniversaire: { mad: 1500, unite: "forfait", aPartirDe: true },
  evjf: { mad: 3000, unite: "forfait", aPartirDe: true },
  "diner-prive": { mad: 600, unite: "pers", aPartirDe: true },
  "decoration-villa": { mad: 1200, unite: "forfait", aPartirDe: true },
  mariage: { mad: 15000, unite: "forfait", aPartirDe: true },
  surprise: { mad: 800, unite: "forfait", aPartirDe: true },
  organisation: { mad: 0, unite: "devis" },
  traiteur: { mad: 450, unite: "pers", aPartirDe: true },
  animation: { mad: 4000, unite: "forfait", aPartirDe: true },
  "photo-video": { mad: 2500, unite: "forfait", duree: { fr: "2 h", en: "2 h" } },
  gateaux: { mad: 600, unite: "forfait", aPartirDe: true },
};

export function eurDepuisMad(mad: number): number {
  return Math.round(mad / TAUX_MAD_PAR_EUR);
}

// Montant estimé pour un service coché (null si sur devis ou sans tarif).
export function montantEstime(key: string, nbPersonnes: number): number | null {
  const t = TARIFS[key];
  if (!t || t.unite === "devis") return null;
  if (t.unite === "pers") return t.mad * nbPersonnes;
  return t.mad;
}
