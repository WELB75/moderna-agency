// Catalogue des services proposés au voyageur sur son lien /sejour/[id] (2026-11-18) : repris de la
// brochure Moderna (activités, expériences, conciergerie, événements), plus les services à la
// villa. Pas de tarifs pour ce premier test : le voyageur coche, choisit le jour, l'heure et le
// nombre de personnes, l'équipe revient vers lui avec le prix et la disponibilité.
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
  { key: "petit-dejeuner", categorie: "villa", icone: "coffee", fr: "Petit-déjeuner", en: "Breakfast" },
  { key: "dejeuner", categorie: "villa", icone: "utensils", fr: "Déjeuner", en: "Lunch" },
  { key: "cuisiniere", categorie: "villa", icone: "chef", fr: "Cuisinière à la villa", en: "Private cook at the villa" },
  { key: "menage", categorie: "villa", icone: "sparkles", fr: "Ménage supplémentaire", en: "Extra housekeeping" },
  { key: "boissons", categorie: "villa", icone: "wine", fr: "Boissons", en: "Drinks" },
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
