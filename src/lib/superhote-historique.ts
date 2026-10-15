// Historique complet Superhote → app (Fouad, 2026-10-15 : "maintenant qu'on bosse plus avec
// superhote, c'est possible de tout récupérer depuis le début et de l'implémenter sur moderna
// agency ?"). Deux formats de fichier sont acceptés et ramenés à une même ligne normalisée :
// - l'export complet "superhote-historique" (colonne superhote_id), généré depuis l'API de
//   connect.superhote.com (SuperHote v2) : toutes les réservations depuis 2023 avec prix, paiements,
//   cautions et coordonnées voyageur ;
// - l'ancien export CSV v1 (Calendriers → Actions → Exporter les réservations : colonnes "rental",
//   "checkin", "total price"...), déjà géré par importSuperhoteCsv.
// Pur (aucun accès base) : planifierImportSuperhote décide quoi créer / compléter à partir des
// données déjà chargées ; actions/superhote-historique.ts lit la base et applique le plan.
import type { SuperhoteCsvRow } from "@/lib/superhote-csv";
import { toTitleCase } from "@/lib/utils";

// Bascule SuperHote → Beds24 (2026-10-13) : pour tout séjour qui se termine après cette date,
// c'est Beds24 qui fait foi (annulations, modifications de dates...). L'import ne crée donc jamais
// de réservation future à partir de Superhote, sauf demande explicite (case à cocher).
export const DATE_BASCULE_BEDS24 = "2026-10-13";

export type StatutLigne = "confirmee" | "annulee" | "demande";

export type LigneSuperhote = {
  superhoteId: string | null;
  reference: string | null;
  plateforme: string; // brut Superhote : "Airbnb.com" | "Booking.com" | "Direct" | "Ical"...
  rentalId: string | null;
  logement: string;
  statut: StatutLigne;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  heureArrivee: number | null; // heure locale (Maroc), ex. 15
  heureDepart: number | null;
  adultes: number | null;
  enfants: number | null;
  voyageurs: number | null;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  pays: string | null;
  prixTotal: number | null; // total payé par le voyageur (= "CA" de Superhote)
  montantPaye: number | null;
  fraisMenage: number | null;
  caution: number | null;
  cautionPayee: boolean;
  devise: string;
  notes: string | null;
  raw: SuperhoteCsvRow;
};

export type FormatFichier = "historique" | "v1";

export function detecterFormat(rows: SuperhoteCsvRow[]): FormatFichier | null {
  const first = rows[0];
  if (!first) return null;
  if ("superhote_id" in first) return "historique";
  if ("rental" in first && "checkin" in first) return "v1";
  return null;
}

function nombre(value: string | undefined): number | null {
  if (value === undefined) return null;
  const v = value.replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function entier(value: string | undefined): number | null {
  const n = nombre(value);
  return n === null ? null : Math.trunc(n);
}

function texte(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" || v === "-" ? null : v;
}

function heure(value: string | undefined): number | null {
  const m = (value ?? "").match(/^(\d{1,2})[:h]/);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

function jour(value: string | undefined): string | null {
  const m = (value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Format français éventuel de l'export v1 : 25/12/2025
  const fr = (value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : null;
}

function premiereValeur(row: SuperhoteCsvRow, ...cles: string[]): string | undefined {
  for (const cle of cles) {
    if (row[cle] !== undefined && row[cle] !== "") return row[cle];
  }
  return undefined;
}

function depuisHistorique(row: SuperhoteCsvRow): LigneSuperhote | null {
  const checkin = jour(row["checkin"]);
  const checkout = jour(row["checkout"]);
  if (!checkin || !checkout) return null;
  const statutBrut = row["statut"];
  const statut: StatutLigne = statutBrut === "annulee" ? "annulee" : statutBrut === "demande" ? "demande" : "confirmee";
  const cautionRequise = row["caution_requise"] === "true";
  const cautionStatut = (row["caution_statut"] ?? "").toUpperCase();
  const notes = [texte(row["demandes_speciales"]), texte(row["notes_privees"])].filter(Boolean).join("\n");
  return {
    superhoteId: texte(row["superhote_id"]),
    reference: texte(row["reference"]),
    plateforme: (row["plateforme"] ?? "").trim(),
    rentalId: texte(row["rental_id"]),
    logement: (row["logement"] ?? "").trim(),
    statut,
    checkin,
    checkout,
    heureArrivee: heure(row["heure_arrivee"]),
    heureDepart: heure(row["heure_depart"]),
    adultes: entier(row["adultes"]),
    enfants: entier(row["enfants"]),
    voyageurs: entier(row["voyageurs"]),
    prenom: (row["prenom"] ?? "").trim(),
    nom: (row["nom"] ?? "").trim().replace(/^-$/, ""),
    email: texte(row["email"]),
    telephone: texte(row["telephone"]),
    pays: texte(row["pays"]),
    prixTotal: nombre(row["prix_total_voyageur"]),
    montantPaye: nombre(row["montant_paye"]),
    fraisMenage: nombre(row["frais_menage"]),
    caution: cautionRequise ? nombre(row["caution_montant"]) : null,
    cautionPayee: cautionRequise && (cautionStatut === "PAID" || cautionStatut === "CAPTURED" || cautionStatut === "AUTHORIZED"),
    devise: texte(row["devise"]) ?? "EUR",
    notes: notes || null,
    raw: row,
  };
}

function depuisV1(row: SuperhoteCsvRow): LigneSuperhote | null {
  const checkin = jour(row["checkin"]);
  const checkout = jour(row["checkout"]);
  if (!checkin || !checkout) return null;
  const statutBrut = (row["status"] ?? "").toLowerCase();
  const statut: StatutLigne = statutBrut.startsWith("cancel") ? "annulee" : "confirmee";
  return {
    superhoteId: texte(premiereValeur(row, "id", "booking id", "reservation id")),
    reference: texte(premiereValeur(row, "reference", "booking reference")),
    plateforme: (premiereValeur(row, "source", "platform", "channel") ?? "").trim(),
    rentalId: texte(premiereValeur(row, "rental id")),
    logement: (row["rental"] ?? "").trim(),
    statut,
    checkin,
    checkout,
    heureArrivee: null,
    heureDepart: null,
    adultes: entier(premiereValeur(row, "adults", "adults count")),
    enfants: entier(premiereValeur(row, "children", "children count")),
    voyageurs: entier(premiereValeur(row, "guests", "guests count")),
    prenom: (row["guest first name"] ?? "").trim(),
    nom: (row["guest last name"] ?? "").trim(),
    email: texte(premiereValeur(row, "guest email", "email")),
    telephone: texte(premiereValeur(row, "guest phone", "phone")),
    pays: texte(premiereValeur(row, "guest country", "country")),
    prixTotal: nombre(row["total price"]),
    montantPaye: nombre(row["total payments"]),
    fraisMenage: nombre(premiereValeur(row, "cleaning fee", "cleaning fees")),
    caution: null,
    cautionPayee: false,
    devise: texte(premiereValeur(row, "currency")) ?? "EUR",
    notes: texte(premiereValeur(row, "comments", "notes")),
    raw: row,
  };
}

export function normaliserLignes(rows: SuperhoteCsvRow[]): { format: FormatFichier | null; lignes: LigneSuperhote[]; illisibles: number } {
  const format = detecterFormat(rows);
  if (!format) return { format, lignes: [], illisibles: rows.length };
  const lignes: LigneSuperhote[] = [];
  let illisibles = 0;
  for (const row of rows) {
    const ligne = format === "historique" ? depuisHistorique(row) : depuisV1(row);
    if (ligne) lignes.push(ligne);
    else illisibles++;
  }
  return { format, lignes, illisibles };
}

// Canal au format actuel de l'app (celui écrit par Beds24, voir mapCanal dans beds24/sync.ts),
// pour que normaliseCanal colore l'historique comme le reste. Séjours du propriétaire / de la
// famille : mêmes libellés que l'assistant de création (LIBELLES_TYPE dans actions/reservations.ts).
export function canalPourLigne(ligne: LigneSuperhote): string {
  const nomComplet = `${ligne.prenom} ${ligne.nom}`.toLowerCase();
  const p = ligne.plateforme.toLowerCase();
  if (p.includes("airbnb")) return "Airbnb";
  if (p.includes("booking")) return "Booking.com";
  if (/propri[eé]taire/.test(nomComplet)) return "Blocage · Propriétaire";
  if (/\bfamille\b/.test(nomComplet)) return "Famille";
  if (p === "" || p.includes("direct") || p.includes("superhote") || p.includes("site")) return "Direct";
  return ligne.plateforme;
}

// Réservations "Ical" de Superhote = réservations créées dans l'app elle-même et renvoyées à
// Superhote par le flux iCal de l'app (/api/ical/export) : elles existent déjà ici (ou étaient des
// tests), on ne les réimporte jamais.
export function estRetourIcalDeLApp(ligne: LigneSuperhote): boolean {
  return ligne.plateforme.trim().toLowerCase() === "ical";
}

export function nomVoyageur(ligne: LigneSuperhote): string {
  const brut = `${ligne.prenom} ${ligne.nom}`.replace(/\s+/g, " ").trim();
  if (brut) return brut;
  const canal = canalPourLigne(ligne);
  return ligne.reference ? `${canal} ${ligne.reference}` : `Réservation ${canal}`;
}

// Heure locale Maroc stockée telle quelle en UTC (même convention que toDateTime dans
// beds24/sync.ts et nowInMorocco) — 15h/11h par défaut comme Beds24.
export function dateHeure(jourIso: string, heureLocale: number | null, defaut: number): Date {
  const [y, m, d] = jourIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, heureLocale ?? defaut, 0, 0));
}

const JOUR_MS = 24 * 60 * 60 * 1000;

function jourUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Écart en jours entre une date de l'app (timestamp) et un jour ISO — tolérance d'un jour au
// rapprochement : selon la source (iCal Superhote, Beds24, saisie manuelle), la même nuit a pu être
// stockée à minuit local, 15h, ou décalée d'un fuseau.
export function ecartJours(date: Date, jourIso: string): number {
  const [y, m, d] = jourIso.split("-").map(Number);
  return Math.round(Math.abs(jourUtc(date) - Date.UTC(y, m - 1, d)) / JOUR_MS);
}

// Chevauchement à la nuit près : [arrivée, départ[ de part et d'autre.
export function seChevauchent(aDebut: Date, aFin: Date, jourDebut: string, jourFin: string): boolean {
  const debut = dateHeure(jourDebut, 0, 0).getTime();
  const fin = dateHeure(jourFin, 0, 0).getTime();
  return jourUtc(aDebut) < fin && jourUtc(aFin) > debut;
}

export function normaliserNomLogement(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Plan d'import : quoi créer, quoi compléter, quoi ignorer — à partir des données déjà chargées.
// Règles (Fouad, 2026-10-15) :
// - Une réservation déjà dans l'app (même identifiant Superhote, ou même villa et mêmes dates à un
//   jour près) n'est jamais dupliquée : on complète seulement ce qui manque (loyer, montant payé,
//   caution, canal, téléphone/email, nb de voyageurs) — jamais d'écrasement d'une saisie manuelle.
// - Séjours après la bascule Beds24 : Beds24 fait foi, rien n'est créé sauf option explicite.
// - Retours iCal de l'app elle-même et demandes non confirmées : ignorés.

export type OptionsImportSuperhote = { inclureFutures?: boolean };

export type VillaPourImport = { id: string; nom: string; superhoteListingId: string | null };

export type ReservationPourImport = {
  id: string;
  villaId: string | null;
  superhoteBookingId: string | null;
  checkIn: Date;
  checkOut: Date;
  status: string;
  source: string;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  fraisMenage: string | null;
  devisePaiement: string;
  canal: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  guestsCount: number | null;
  rawData: unknown;
};

export type ClientPourImport = { telephone: string | null; email: string | null };

export type ReservationACreer = {
  villaId: string;
  superhoteBookingId: string | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  checkIn: Date;
  checkOut: Date;
  guestsCount: number | null;
  nbAdultes: number | null;
  nbEnfants: number | null;
  status: string;
  source: string;
  canal: string;
  notes: string | null;
  rawData: Record<string, unknown>;
  loyerTotal: string | null;
  montantPaye: string | null;
  caution: string | null;
  cautionPayee: boolean;
  fraisMenage: string | null;
  devisePaiement: string;
};

export type ChampsCompletes = {
  loyerTotal?: string;
  devisePaiement?: string;
  montantPaye?: string;
  caution?: string;
  cautionPayee?: boolean;
  fraisMenage?: string;
  canal?: string;
  guestPhone?: string;
  guestEmail?: string;
  nbAdultes?: number | null;
  nbEnfants?: number | null;
  guestsCount?: number | null;
  superhoteBookingId?: string;
  status?: string;
};

export type MiseAJourReservation = { id: string; valeurs: ChampsCompletes & { rawData: Record<string, unknown>; updatedAt: Date } };

export type ClientACreer = { nom: string; telephone: string | null; email: string | null; notes: string };

type ExempleLigne = { voyageur: string; logement: string; arrivee: string; depart: string };

export type BilanImportSuperhote = {
  format: FormatFichier | null;
  totalLignes: number;
  illisibles: number;
  aCreer: number;
  aCreerAnnulees: number;
  aCompleter: number;
  rattachees: number; // déjà complètes : seule la fiche Superhote brute est ajoutée
  dejaAJour: number;
  futuresIgnorees: number;
  exemplesFutures: ExempleLigne[];
  conflits: number;
  exemplesConflits: ExempleLigne[];
  ignoreesIcal: number;
  ignoreesDemandes: number;
  ignoreesManuellement: number;
  logementsInconnus: string[];
  lignesLogementInconnu: number;
  clientsACreer: number;
  parAnnee: { annee: string; reservations: number; ca: number }[];
  // Renseignés seulement après un import réel.
  crees?: number;
  completees?: number;
  clientsCrees?: number;
};

export type PlanImportSuperhote = {
  bilan: BilanImportSuperhote;
  insertions: ReservationACreer[];
  misesAJour: MiseAJourReservation[];
  nouveauxClients: ClientACreer[];
};

function montantApp(value: string | number | null | undefined): number {
  const n = value === null || value === undefined ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function exemple(ligne: LigneSuperhote): ExempleLigne {
  return { voyageur: nomVoyageur(ligne), logement: ligne.logement.slice(0, 40), arrivee: ligne.checkin, depart: ligne.checkout };
}

function queueTelephone(tel: string | null | undefined): string | null {
  const tail = (tel ?? "").replace(/\D/g, "").slice(-9);
  return tail.length === 9 ? tail : null;
}

// Emails relais des plateformes (ex. xxx@guest.booking.com) : propres à chaque séjour, inutiles
// pour reconnaître un voyageur qui revient.
function emailUtile(email: string | null): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return /@(guest\.)?(airbnb|booking)\.com$|expediapartnercentral\.com$/.test(e) ? null : e;
}

export function planifierImportSuperhote(
  fichier: { format: FormatFichier; lignes: LigneSuperhote[]; totalLignes: number; illisibles: number },
  app: { villas: VillaPourImport[]; reservations: ReservationPourImport[]; clients: ClientPourImport[]; idsIgnores: string[] },
  options: OptionsImportSuperhote,
  importeLe: string
): PlanImportSuperhote {
  const villasNormalisees = app.villas
    .map((v) => ({ ...v, cle: normaliserNomLogement(v.nom) }))
    .filter((v) => v.cle)
    .sort((a, b) => b.cle.length - a.cle.length);
  const cacheVilla = new Map<string, string | null>();
  function trouverVilla(ligne: LigneSuperhote): string | null {
    const cleCache = `${ligne.rentalId ?? ""}|${ligne.logement}`;
    const enCache = cacheVilla.get(cleCache);
    if (enCache !== undefined) return enCache;
    let id: string | null = null;
    if (ligne.rentalId) id = app.villas.find((v) => v.superhoteListingId && v.superhoteListingId === ligne.rentalId)?.id ?? null;
    if (!id) {
      const cible = normaliserNomLogement(ligne.logement);
      id = villasNormalisees.find((v) => cible === v.cle || cible.startsWith(`${v.cle} `))?.id ?? null;
    }
    cacheVilla.set(cleCache, id);
    return id;
  }

  const ignorees = new Set(app.idsIgnores);
  const parIdSuperhote = new Map<string, ReservationPourImport>();
  for (const r of app.reservations) if (r.superhoteBookingId) parIdSuperhote.set(r.superhoteBookingId, r);
  const idsSuperhoteUtilises = new Set(parIdSuperhote.keys());
  const resasParVilla = new Map<string, ReservationPourImport[]>();
  for (const r of app.reservations) {
    if (!r.villaId) continue;
    const liste = resasParVilla.get(r.villaId) ?? [];
    liste.push(r);
    resasParVilla.set(r.villaId, liste);
  }

  const bilan: BilanImportSuperhote = {
    format: fichier.format,
    totalLignes: fichier.totalLignes,
    illisibles: fichier.illisibles,
    aCreer: 0,
    aCreerAnnulees: 0,
    aCompleter: 0,
    rattachees: 0,
    dejaAJour: 0,
    futuresIgnorees: 0,
    exemplesFutures: [],
    conflits: 0,
    exemplesConflits: [],
    ignoreesIcal: 0,
    ignoreesDemandes: 0,
    ignoreesManuellement: 0,
    logementsInconnus: [],
    lignesLogementInconnu: 0,
    clientsACreer: 0,
    parAnnee: [],
  };
  const insertions: ReservationACreer[] = [];
  const misesAJour: MiseAJourReservation[] = [];
  const reclamees = new Set<string>();
  const logementsInconnus = new Set<string>();
  const parAnnee = new Map<string, { reservations: number; ca: number }>();
  const lignesRetenues: LigneSuperhote[] = []; // séjours confirmés réels, pour les fiches voyageurs

  function compterAnnee(ligne: LigneSuperhote) {
    if (ligne.statut !== "confirmee") return;
    const annee = ligne.checkin.slice(0, 4);
    const a = parAnnee.get(annee) ?? { reservations: 0, ca: 0 };
    a.reservations++;
    a.ca += ligne.prixTotal && ligne.prixTotal > 0 ? ligne.prixTotal : 0;
    parAnnee.set(annee, a);
  }

  // Séjours réels d'abord : ils ont la priorité pour se rattacher à une réservation de l'app,
  // avant qu'une annulation aux mêmes dates ne puisse la "prendre".
  const ordonnees = [...fichier.lignes].sort((a, b) => Number(a.statut === "annulee") - Number(b.statut === "annulee"));

  for (const ligne of ordonnees) {
    if (estRetourIcalDeLApp(ligne)) {
      bilan.ignoreesIcal++;
      continue;
    }
    // Réservations écartées à la main dans l'app (table ignored_bookings, ex. mauvaise villa dans
    // le flux Superhote) : jamais réimportées.
    if ([ligne.superhoteId, ligne.reference].some((id) => id && ignorees.has(id))) {
      bilan.ignoreesManuellement++;
      continue;
    }
    if (ligne.statut === "demande") {
      bilan.ignoreesDemandes++;
      continue;
    }
    const villaId = trouverVilla(ligne);
    if (!villaId) {
      bilan.lignesLogementInconnu++;
      if (ligne.logement) logementsInconnus.add(ligne.logement.slice(0, 50));
      continue;
    }

    // 1) Même identifiant Superhote (stocké par l'ancienne synchro iCal).
    let match: ReservationPourImport | undefined;
    let parId = false;
    for (const cle of [ligne.superhoteId, ligne.reference]) {
      const r = cle ? parIdSuperhote.get(cle) : undefined;
      if (r && !reclamees.has(r.id)) {
        match = r;
        parId = true;
        break;
      }
    }
    // 2) Même villa, mêmes dates à un jour près (la plus proche, statut identique en priorité).
    if (!match) {
      const candidats = (resasParVilla.get(villaId) ?? [])
        .filter((r) => !reclamees.has(r.id))
        .map((r) => ({
          r,
          ecartArrivee: ecartJours(new Date(r.checkIn), ligne.checkin),
          ecartDepart: ecartJours(new Date(r.checkOut), ligne.checkout),
          memeStatut: (r.status === "annulee") === (ligne.statut === "annulee"),
        }))
        .filter((c) => c.ecartArrivee <= 1 && c.ecartDepart <= 1)
        .sort((a, b) => Number(b.memeStatut) - Number(a.memeStatut) || a.ecartArrivee + a.ecartDepart - (b.ecartArrivee + b.ecartDepart));
      const meilleur = candidats[0];
      // Une annulation Superhote ne doit jamais compléter un séjour bien réel de l'app.
      if (meilleur && meilleur.memeStatut) match = meilleur.r;
      // Séjour confirmé côté Superhote mais annulé dans l'app aux mêmes dates : on ne recrée rien
      // (l'annulation a pu être faite exprès dans l'app), on le signale.
      else if (meilleur && ligne.statut === "confirmee") {
        bilan.conflits++;
        if (bilan.exemplesConflits.length < 15) bilan.exemplesConflits.push(exemple(ligne));
        continue;
      }
    }

    if (match) {
      reclamees.add(match.id);
      compterAnnee(ligne);
      if (ligne.statut === "confirmee") lignesRetenues.push(ligne);
      const valeurs: ChampsCompletes = {};
      const loyerApp = montantApp(match.loyerTotal);
      const payeApp = montantApp(match.montantPaye);
      const cautionApp = montantApp(match.caution);
      if (ligne.statut === "confirmee" && match.status !== "annulee") {
        if (loyerApp <= 0 && ligne.prixTotal && ligne.prixTotal > 0) {
          valeurs.loyerTotal = ligne.prixTotal.toFixed(2);
          if (payeApp <= 0 && cautionApp <= 0 && match.devisePaiement !== ligne.devise) valeurs.devisePaiement = ligne.devise;
        }
        if (payeApp <= 0 && ligne.montantPaye && ligne.montantPaye > 0) valeurs.montantPaye = ligne.montantPaye.toFixed(2);
        if (cautionApp <= 0 && ligne.caution && ligne.caution > 0) valeurs.caution = ligne.caution.toFixed(2);
        if (!match.cautionPayee && ligne.cautionPayee && (cautionApp > 0 || valeurs.caution)) valeurs.cautionPayee = true;
        if (montantApp(match.fraisMenage) <= 0 && ligne.fraisMenage && ligne.fraisMenage > 0) valeurs.fraisMenage = ligne.fraisMenage.toFixed(2);
      }
      if (!match.canal) valeurs.canal = canalPourLigne(ligne);
      if (!match.guestPhone && ligne.telephone) valeurs.guestPhone = ligne.telephone;
      if (!match.guestEmail && ligne.email) valeurs.guestEmail = ligne.email;
      if (match.nbAdultes === null && match.nbEnfants === null && match.guestsCount === null && (ligne.adultes || ligne.enfants)) {
        valeurs.nbAdultes = ligne.adultes;
        valeurs.nbEnfants = ligne.enfants;
        valeurs.guestsCount = ligne.voyageurs ?? ((ligne.adultes ?? 0) + (ligne.enfants ?? 0) || null);
      }
      if (!match.superhoteBookingId && ligne.superhoteId && !idsSuperhoteUtilises.has(ligne.superhoteId)) {
        valeurs.superhoteBookingId = ligne.superhoteId;
        idsSuperhoteUtilises.add(ligne.superhoteId);
      }
      // Annulée côté Superhote mais encore confirmée ici : seulement pour une réservation venue de
      // Superhote, reconnue par son identifiant, et d'avant la bascule (sinon Beds24 fait foi).
      if (parId && ligne.statut === "annulee" && match.status !== "annulee" && match.source === "superhote" && ligne.checkout <= DATE_BASCULE_BEDS24) {
        valeurs.status = "annulee";
      }

      const rawActuel =
        match.rawData && typeof match.rawData === "object" && !Array.isArray(match.rawData) ? (match.rawData as Record<string, unknown>) : {};
      const aDejaLaFiche = "superhote" in rawActuel;
      const changementsMetier = Object.keys(valeurs).length > 0;
      if (changementsMetier) bilan.aCompleter++;
      else if (!aDejaLaFiche) bilan.rattachees++;
      else bilan.dejaAJour++;
      if (changementsMetier || !aDejaLaFiche) {
        misesAJour.push({
          id: match.id,
          valeurs: { ...valeurs, rawData: { ...rawActuel, superhote: ligne.raw, importHistoriqueSuperhote: importeLe }, updatedAt: new Date() },
        });
      }
      continue;
    }

    // Pas dans l'app.
    if (ligne.checkout > DATE_BASCULE_BEDS24 && !options.inclureFutures) {
      if (ligne.statut === "confirmee") {
        bilan.futuresIgnorees++;
        if (bilan.exemplesFutures.length < 15) bilan.exemplesFutures.push(exemple(ligne));
      }
      continue;
    }
    if (ligne.statut === "confirmee") {
      const occupe =
        (resasParVilla.get(villaId) ?? []).some(
          (r) => r.status !== "annulee" && seChevauchent(new Date(r.checkIn), new Date(r.checkOut), ligne.checkin, ligne.checkout)
        ) || insertions.some((i) => i.villaId === villaId && i.status !== "annulee" && seChevauchent(i.checkIn, i.checkOut, ligne.checkin, ligne.checkout));
      if (occupe) {
        bilan.conflits++;
        if (bilan.exemplesConflits.length < 15) bilan.exemplesConflits.push(exemple(ligne));
        continue;
      }
    }

    const idUnique = ligne.superhoteId && !idsSuperhoteUtilises.has(ligne.superhoteId) ? ligne.superhoteId : null;
    if (idUnique) idsSuperhoteUtilises.add(idUnique);
    insertions.push({
      villaId,
      superhoteBookingId: idUnique,
      guestName: toTitleCase(nomVoyageur(ligne)),
      guestPhone: ligne.telephone,
      guestEmail: ligne.email,
      checkIn: dateHeure(ligne.checkin, ligne.heureArrivee, 15),
      checkOut: dateHeure(ligne.checkout, ligne.heureDepart, 11),
      guestsCount: ligne.voyageurs ?? ((ligne.adultes ?? 0) + (ligne.enfants ?? 0) || null),
      nbAdultes: ligne.adultes,
      nbEnfants: ligne.enfants,
      status: ligne.statut === "annulee" ? "annulee" : "confirmee",
      source: "superhote",
      canal: canalPourLigne(ligne),
      notes: ligne.notes,
      rawData: { superhote: ligne.raw, importHistoriqueSuperhote: importeLe },
      loyerTotal: ligne.prixTotal && ligne.prixTotal > 0 ? ligne.prixTotal.toFixed(2) : null,
      montantPaye: ligne.montantPaye && ligne.montantPaye > 0 ? ligne.montantPaye.toFixed(2) : null,
      caution: ligne.caution && ligne.caution > 0 ? ligne.caution.toFixed(2) : null,
      cautionPayee: Boolean(ligne.caution && ligne.caution > 0 && ligne.cautionPayee),
      fraisMenage: ligne.fraisMenage && ligne.fraisMenage > 0 ? ligne.fraisMenage.toFixed(2) : null,
      devisePaiement: ligne.devise,
    });
    if (ligne.statut === "annulee") bilan.aCreerAnnulees++;
    else {
      bilan.aCreer++;
      compterAnnee(ligne);
      lignesRetenues.push(ligne);
    }
  }

  // Fiches voyageurs : un client payant (loyer connu, pas un blocage propriétaire/famille) avec au
  // moins un téléphone ou un email utile, regroupé par téléphone (9 derniers chiffres, comme
  // phonesMatch) ou par email — sans doublon avec les fiches déjà dans l'app.
  const telsExistants = new Set(app.clients.map((c) => queueTelephone(c.telephone)).filter((t): t is string => Boolean(t)));
  const emailsExistants = new Set(app.clients.map((c) => emailUtile(c.email)).filter((e): e is string => Boolean(e)));
  type Groupe = { nom: string; telephone: string | null; email: string | null; annees: Set<string>; logements: Set<string>; sejours: number };
  const groupes = new Map<string, Groupe>();
  const cleParTel = new Map<string, string>();
  const cleParEmail = new Map<string, string>();
  for (const ligne of lignesRetenues) {
    if (!ligne.prixTotal || ligne.prixTotal <= 0) continue;
    const canal = canalPourLigne(ligne);
    if (canal.startsWith("Blocage") || canal === "Famille") continue;
    const tel = queueTelephone(ligne.telephone);
    const email = emailUtile(ligne.email);
    if (!tel && !email) continue;
    if ((tel && telsExistants.has(tel)) || (email && emailsExistants.has(email))) continue;
    const cle = (tel && cleParTel.get(tel)) || (email && cleParEmail.get(email)) || tel || email || "";
    if (tel) cleParTel.set(tel, cle);
    if (email) cleParEmail.set(email, cle);
    const g: Groupe = groupes.get(cle) ?? { nom: toTitleCase(nomVoyageur(ligne)), telephone: null, email: null, annees: new Set(), logements: new Set(), sejours: 0 };
    g.telephone = g.telephone ?? ligne.telephone;
    g.email = g.email ?? email;
    g.annees.add(ligne.checkin.slice(0, 4));
    g.logements.add(ligne.logement.split(/\s*[-–—|]\s*/)[0].trim().slice(0, 30));
    g.sejours++;
    groupes.set(cle, g);
  }
  const nouveauxClients: ClientACreer[] = [...groupes.values()].map((g) => ({
    nom: g.nom,
    telephone: g.telephone,
    email: g.email,
    notes: `Historique Superhote : ${g.sejours} séjour${g.sejours > 1 ? "s" : ""} (${[...g.annees].sort().join(", ")}) — ${[...g.logements].join(", ")}.`,
  }));
  bilan.clientsACreer = nouveauxClients.length;
  bilan.logementsInconnus = [...logementsInconnus].slice(0, 20);
  bilan.parAnnee = [...parAnnee.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([annee, v]) => ({ annee, reservations: v.reservations, ca: Math.round(v.ca) }));

  return { bilan, insertions, misesAJour, nouveauxClients };
}
