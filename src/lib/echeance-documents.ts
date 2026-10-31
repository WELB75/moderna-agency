// Échéance des documents d'arrivée — Fouad, 2026-10-30 : « il faudrait que la fiche police et le
// contrat soient réglés 24 heures avant l'arrivée du client ». Tout ce qui, sur l'accueil, parle
// de fiche police / contrat se cale sur cette seule règle : la limite est J-1 à la même heure que
// l'arrivée, et le compte à rebours affiché compte jusqu'à cette limite (pas jusqu'à l'arrivée).
//
// Dates "heure marocaine stockée telle quelle en UTC" comme partout dans l'app (voir now.ts) : on
// ne fait que soustraire des millisecondes, donc aucune conversion de fuseau n'intervient.

export const DELAI_DOCUMENTS_MS = 24 * 60 * 60 * 1000;

export function echeanceDocuments(checkIn: Date): Date {
  return new Date(checkIn.getTime() - DELAI_DOCUMENTS_MS);
}

export type EtatEcheance = "ok" | "a_temps" | "bientot" | "retard" | "arrive";

export type Echeance = {
  etat: EtatEcheance;
  tone: "ok" | "attente" | "urgent" | "neutre";
  // Ce qu'il reste à faire, dans l'ordre d'affichage ("Fiche police", "Contrat").
  manquants: string[];
  // Texte court du compte à rebours : "dans 9 h", "en retard de 3 h", "tout est prêt"...
  label: string;
  // Phrase complète pour un titre/une info-bulle.
  detail: string;
};

// Texte "9 h 05", "2 j 3 h", "12 min" — sans le "dans"/"depuis", ajouté par l'appelant.
export function dureeCourte(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(ms) / 60_000));
  const jours = Math.floor(totalMinutes / (60 * 24));
  const heures = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (jours > 0) return heures > 0 ? `${jours} j ${heures} h` : `${jours} j`;
  if (heures > 0) return minutes > 0 ? `${heures} h ${String(minutes).padStart(2, "0")}` : `${heures} h`;
  return `${Math.max(1, minutes)} min`;
}

// Seuil "bientôt" : moins de 6 h avant la limite, pour que la couleur passe à l'orange avant
// d'être en retard (il faut le temps de relancer le voyageur).
const BIENTOT_MS = 6 * 60 * 60 * 1000;

export function calculerEcheance(
  r: { checkIn: Date; ficheStatut: "complete" | "en_attente" | null; contratStatut: "signe" | "en_attente" | null },
  now: Date
): Echeance {
  const manquants: string[] = [];
  if (r.ficheStatut !== "complete") manquants.push("Fiche police");
  if (r.contratStatut !== "signe") manquants.push("Contrat");
  const limite = echeanceDocuments(r.checkIn);
  const reste = limite.getTime() - now.getTime();

  if (manquants.length === 0) {
    return { etat: "ok", tone: "ok", manquants, label: "Documents prêts", detail: "Fiche police faite et contrat signé." };
  }
  const quoi = manquants.join(" + ").toLowerCase();
  if (now.getTime() >= r.checkIn.getTime()) {
    return {
      etat: "arrive",
      tone: "urgent",
      manquants,
      label: `Arrivé sans ${quoi}`,
      detail: `Le voyageur est arrivé sans ${quoi}.`,
    };
  }
  if (reste <= 0) {
    return {
      etat: "retard",
      tone: "urgent",
      manquants,
      label: `En retard de ${dureeCourte(reste)}`,
      detail: `Limite J-1 dépassée depuis ${dureeCourte(reste)} : ${quoi} toujours manquant.`,
    };
  }
  if (reste <= BIENTOT_MS) {
    return {
      etat: "bientot",
      tone: "attente",
      manquants,
      label: `${dureeCourte(reste)} restantes`,
      detail: `Il reste ${dureeCourte(reste)} pour régler ${quoi} (limite : 24 h avant l'arrivée).`,
    };
  }
  return {
    etat: "a_temps",
    tone: "neutre",
    manquants,
    label: `${dureeCourte(reste)} restantes`,
    detail: `Il reste ${dureeCourte(reste)} pour régler ${quoi} (limite : 24 h avant l'arrivée).`,
  };
}
