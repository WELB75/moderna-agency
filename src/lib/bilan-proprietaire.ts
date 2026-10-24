import { and, asc, eq, gt, gte, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries, reservations } from "@/db/schema";
import { normaliseCanal } from "@/lib/canal";
import { sejourSansVoyageur } from "@/lib/conditions-sejour";
import { estDirham, getMadParEur } from "@/lib/devises";
import { versEuros } from "@/lib/logement-stats";
import { nowInMorocco } from "@/lib/now";

// Bilan mensuel de l'espace propriétaire (/cal/[token]) — Fouad, 2026-10-24 : "tout pour
// rassurer le propriétaire et lui montrer qu'il y a une vraie traçabilité et que les chiffres
// sont là". Mois par mois depuis août 2026 : loyers par canal (Airbnb, Booking.com, en direct),
// dépenses engagées pour le bien, solde — avec le détail des séjours et des dépenses derrière
// chaque mois.
//
// Choix validés avec Fouad le 2026-10-24 :
// - loyers = le loyer brut du séjour (reservations.loyerTotal, le "Total du séjour" déjà affiché
//   au propriétaire), réparti au prorata des nuits passées dans chaque mois, sans déduction de la
//   commission de l'agence ;
// - dépenses = seulement les dépenses de caisse rattachées au logement en catégorie Hébergement
//   (réparations, achats, entretien du bien) et Jardinier — pas le ménage ni la cuisine payés par
//   l'agence pour les clients ;
// - depuis août 2026, mois à venir inclus dès qu'ils ont des réservations confirmées (marqués
//   "à venir" : c'est du prévisionnel).
// Tout est converti en euros (les dépenses sont saisies en dirhams), au taux du jour de
// lib/devises.ts — le montant d'origine est gardé sur chaque ligne de dépense.

export const DEBUT_BILAN = { annee: 2026, mois: 7 }; // août 2026 (mois 0-11)
export const CATEGORIES_DEPENSES_PROPRIETAIRE = ["hebergement", "jardinier"] as const;
const MAX_MOIS_A_VENIR = 12;

export type CanalBilan = "airbnb" | "booking" | "direct" | "autre";
export const CANAUX_BILAN: CanalBilan[] = ["airbnb", "booking", "direct", "autre"];

export type SejourBilan = {
  id: string;
  nom: string;
  canal: CanalBilan;
  canalLibelle: string | null;
  arrivee: string; // YYYY-MM-DD
  depart: string; // YYYY-MM-DD
  nuitsTotal: number;
  nuitsDansLeMois: number;
  montant: number; // part du loyer (EUR) attribuée à ce mois
  loyerConnu: boolean; // false : séjour sans loyer renseigné (compte pour les nuits, pas pour les loyers)
};

export type DepenseBilan = {
  id: string;
  date: string; // YYYY-MM-DD
  libelle: string;
  categorie: string;
  montantEur: number;
  montantOrigine: number;
  devise: string;
};

export type MoisBilan = {
  cle: string; // YYYY-MM
  label: string; // "Août 2026"
  labelCourt: string; // "Août" ou "Janv. 27" si le bilan change d'année
  statut: "passe" | "en_cours" | "a_venir";
  nuits: number;
  parCanal: Record<CanalBilan, number>;
  loyers: number;
  depenses: number;
  solde: number;
  sejours: SejourBilan[];
  depensesLignes: DepenseBilan[];
};

export type BilanProprietaire = {
  mois: MoisBilan[];
  madParEur: number;
  aDesDirhams: boolean; // au moins une dépense saisie en dirhams (pour expliquer le taux)
};

const MOIS_COURTS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const MOIS_LONGS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Les check-in/check-out sont stockés "heure marocaine lue comme UTC" (voir lib/now.ts) : tous
// les calculs de jours se font sur les composants UTC, jamais sur le fuseau du serveur.
function jourUtc(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

function isoJourUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Les dépenses de caisse ont un vrai horodatage (defaultNow) : on prend le jour marocain.
function isoJourMaroc(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function cleMois(annee: number, mois: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}`;
}

function canalBilan(canal: string | null): CanalBilan {
  const key = normaliseCanal(canal);
  return key === "airbnb" || key === "booking" || key === "direct" ? key : "autre";
}

function parCanalVide(): Record<CanalBilan, number> {
  return { airbnb: 0, booking: 0, direct: 0, autre: 0 };
}

export async function getBilanProprietaire(villaId: string): Promise<BilanProprietaire> {
  const db = getDb();
  const debut = new Date(Date.UTC(DEBUT_BILAN.annee, DEBUT_BILAN.mois, 1));
  const maintenant = nowInMorocco();
  const anneeCourante = maintenant.getUTCFullYear();
  const moisCourant = maintenant.getUTCMonth();

  const [madParEur, lignesResa, lignesDepenses] = await Promise.all([
    getMadParEur(),
    db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        canal: reservations.canal,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        loyerTotal: reservations.loyerTotal,
        devisePaiement: reservations.devisePaiement,
      })
      .from(reservations)
      .where(and(eq(reservations.villaId, villaId), ne(reservations.status, "annulee"), gt(reservations.checkOut, debut)))
      .orderBy(asc(reservations.checkIn)),
    db
      .select({
        id: cashEntries.id,
        categorie: cashEntries.categorie,
        montant: cashEntries.montant,
        devise: cashEntries.devise,
        description: cashEntries.description,
        createdAt: cashEntries.createdAt,
      })
      .from(cashEntries)
      .where(
        and(
          eq(cashEntries.villaId, villaId),
          eq(cashEntries.type, "depense"),
          inArray(cashEntries.categorie, [...CATEGORIES_DEPENSES_PROPRIETAIRE]),
          gte(cashEntries.createdAt, debut)
        )
      )
      .orderBy(asc(cashEntries.createdAt)),
  ]);

  // Séjours payants seulement : ni les blocages (propriétaire, travaux, "Blocage Airbnb", dates
  // fermées), ni les séjours "Famille".
  const sejours = lignesResa
    .filter((r) => !sejourSansVoyageur(r) && normaliseCanal(r.canal) !== "bloque")
    .map((r) => {
      const checkIn = new Date(r.checkIn);
      const checkOut = new Date(r.checkOut);
      const loyer = r.loyerTotal ? Number(r.loyerTotal) : 0;
      return {
        id: r.id,
        nom: r.guestName,
        canal: canalBilan(r.canal),
        canalLibelle: r.canal,
        jourIn: jourUtc(checkIn),
        jourOut: jourUtc(checkOut),
        arrivee: isoJourUtc(checkIn),
        depart: isoJourUtc(checkOut),
        loyerEur: loyer > 0 ? versEuros(loyer, r.devisePaiement, madParEur) : 0,
        loyerConnu: loyer > 0,
      };
    })
    .filter((s) => s.jourOut > s.jourIn);

  // Du premier mois du bilan jusqu'au mois en cours, prolongé jusqu'au dernier mois touché par un
  // séjour confirmé (prévisionnel) — borné pour qu'une résa saisie très loin n'étire pas la page.
  let finAnnee = anneeCourante;
  let finMois = moisCourant;
  for (const s of sejours) {
    const derniereNuit = new Date((s.jourOut - 1) * 86400000);
    const a = derniereNuit.getUTCFullYear();
    const m = derniereNuit.getUTCMonth();
    if (a > finAnnee || (a === finAnnee && m > finMois)) {
      finAnnee = a;
      finMois = m;
    }
  }
  const indexCourant = anneeCourante * 12 + moisCourant;
  const indexFin = Math.min(finAnnee * 12 + finMois, indexCourant + MAX_MOIS_A_VENIR);
  const indexDebut = DEBUT_BILAN.annee * 12 + DEBUT_BILAN.mois;
  const plusieursAnnees = Math.floor(indexDebut / 12) !== Math.floor(indexFin / 12);

  const mois: MoisBilan[] = [];
  for (let index = indexDebut; index <= indexFin; index++) {
    const annee = Math.floor(index / 12);
    const m = index % 12;
    const jourDebutMois = jourUtc(new Date(Date.UTC(annee, m, 1)));
    const jourFinMois = jourUtc(new Date(Date.UTC(annee, m + 1, 1)));

    const parCanal = parCanalVide();
    let nuits = 0;
    let loyers = 0;
    const sejoursDuMois: SejourBilan[] = [];
    for (const s of sejours) {
      const nuitsDansLeMois = Math.max(0, Math.min(s.jourOut, jourFinMois) - Math.max(s.jourIn, jourDebutMois));
      if (nuitsDansLeMois <= 0) continue;
      const nuitsTotal = s.jourOut - s.jourIn;
      const montant = s.loyerConnu ? (s.loyerEur * nuitsDansLeMois) / nuitsTotal : 0;
      nuits += nuitsDansLeMois;
      loyers += montant;
      parCanal[s.canal] += montant;
      sejoursDuMois.push({
        id: s.id,
        nom: s.nom,
        canal: s.canal,
        canalLibelle: s.canalLibelle,
        arrivee: s.arrivee,
        depart: s.depart,
        nuitsTotal,
        nuitsDansLeMois,
        montant,
        loyerConnu: s.loyerConnu,
      });
    }

    const cle = cleMois(annee, m);
    const depensesLignes: DepenseBilan[] = lignesDepenses
      .filter((d) => isoJourMaroc(new Date(d.createdAt)).slice(0, 7) === cle)
      .map((d) => ({
        id: d.id,
        date: isoJourMaroc(new Date(d.createdAt)),
        libelle: (d.description ?? "").trim() || (d.categorie === "jardinier" ? "Jardinage" : "Dépense pour le logement"),
        categorie: d.categorie ?? "hebergement",
        montantEur: versEuros(Number(d.montant), d.devise, madParEur),
        montantOrigine: Number(d.montant),
        devise: d.devise,
      }));
    const depenses = depensesLignes.reduce((somme, d) => somme + d.montantEur, 0);

    mois.push({
      cle,
      label: `${MOIS_LONGS[m]} ${annee}`,
      labelCourt: plusieursAnnees ? `${MOIS_COURTS[m]} ${String(annee).slice(2)}` : MOIS_COURTS[m],
      statut: index < indexCourant ? "passe" : index === indexCourant ? "en_cours" : "a_venir",
      nuits,
      parCanal,
      loyers,
      depenses,
      solde: loyers - depenses,
      sejours: sejoursDuMois,
      depensesLignes,
    });
  }

  return {
    mois,
    madParEur,
    aDesDirhams: lignesDepenses.some((d) => estDirham(d.devise)),
  };
}
