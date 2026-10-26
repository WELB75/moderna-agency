// Règles de l'annulation locale d'une réservation depuis le calendrier (voir annulerReservation
// dans actions/reservations.ts). Module sans dépendance serveur : importable côté navigateur et
// testable tel quel.
//
// Annuler = soft delete : la ligne passe en statut "annulee" (déjà exclu partout : planning,
// disponibilités, stats, iCal, liens propriétaires) et garde son ID Beds24. Rien n'est annulé
// côté Beds24 / Booking.com / Airbnb : c'est uniquement un nettoyage local.

export const MOTIFS_ANNULATION = [
  { code: "annulation", libelle: "Annulation" },
  { code: "sans_nouvelles", libelle: "Plus de nouvelles du client" },
  { code: "erreur_saisie", libelle: "Erreur de saisie" },
] as const;

export type MotifAnnulation = (typeof MOTIFS_ANNULATION)[number]["code"];

export function libelleMotif(code: string): string | null {
  return MOTIFS_ANNULATION.find((m) => m.code === code)?.libelle ?? null;
}

export type AnnulationLocale = { motif: string; par: string; le: string };

function annulationLocale(rawData: unknown): AnnulationLocale | null {
  if (!rawData || typeof rawData !== "object") return null;
  const a = (rawData as Record<string, unknown>).annulationLocale;
  return a && typeof a === "object" ? (a as AnnulationLocale) : null;
}

// Réservation annulée à la main dans l'app : les synchros (Beds24, iCal) ne doivent ni la
// remettre en "confirmée" ni écraser son marqueur, même si la plateforme la renvoie encore.
export function annuleeLocalement(row: { status: string; rawData: unknown }): boolean {
  return row.status === "annulee" && annulationLocale(row.rawData) !== null;
}

// Statut à écrire lors de la synchro Beds24 d'une réservation déjà connue.
export function statutApresSynchro(existing: { status: string; rawData: unknown } | undefined, statutBeds24: "annulee" | "confirmee"): "annulee" | "confirmee" {
  return existing && annuleeLocalement(existing) ? "annulee" : statutBeds24;
}

export type Encaisse = { loyer: number; caution: number };

// Montants déjà encaissés qui justifient un avertissement avant d'annuler.
export function encaisse(r: { montantPaye: number | null; cautionRecue?: number | null }): Encaisse {
  return { loyer: r.montantPaye && r.montantPaye > 0 ? r.montantPaye : 0, caution: r.cautionRecue && r.cautionRecue > 0 ? r.cautionRecue : 0 };
}

export function avertissementEncaisse(e: Encaisse, formatMontant: (n: number) => string): string | null {
  const parts: string[] = [];
  if (e.loyer > 0) parts.push(`Loyer : ${formatMontant(e.loyer)} déjà encaissés`);
  if (e.caution > 0) parts.push(`Caution : ${formatMontant(e.caution)} déjà reçue`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

type Sejour = { id: string; checkIn: string; checkOut: string };

// Réservations actives qui se chevauchent sur le même logement (dates "YYYY-MM-DD"). Un départ le
// jour d'une arrivée n'est pas un chevauchement. À appeler avec les réservations d'UN logement.
export function reservationsEnChevauchement(reservations: Sejour[]): Set<string> {
  const ids = new Set<string>();
  const triees = [...reservations].sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
  for (let i = 0; i < triees.length; i++) {
    for (let j = i + 1; j < triees.length; j++) {
      if (triees[j].checkIn >= triees[i].checkOut) {
        // Triées par arrivée : plus aucun séjour suivant ne peut chevaucher celui-ci.
        break;
      }
      ids.add(triees[i].id);
      ids.add(triees[j].id);
    }
  }
  return ids;
}
