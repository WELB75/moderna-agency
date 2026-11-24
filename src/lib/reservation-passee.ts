// Saisie a posteriori d'un séjour déjà terminé (Kamel, 2026-11-24 : "je dois pouvoir saisir une
// ancienne réservation qui n'a pas été enregistrée"). Règles partagées par l'assistant et le serveur.

function jourISO(valeur: string): string {
  return valeur.slice(0, 10);
}

// Jour (YYYY-MM-DD) d'aujourd'hui côté Maroc : le jour change à minuit heure de Casablanca, pas UTC.
export function aujourdhuiMaroc(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(maintenant);
}

// Séjour terminé : le départ est aujourd'hui ou avant. Seuls ces séjours peuvent être saisis avec
// l'option "réservation passée" (sinon la case servirait à contourner le blocage des dates à venir).
export function sejourEstTermine(checkOut: string, maintenant: Date = new Date()): boolean {
  return jourISO(checkOut) <= aujourdhuiMaroc(maintenant);
}

// Séjour entièrement dans le passé (départ avant aujourd'hui) : refusé sans l'option.
export function sejourEntierementPasse(checkOut: string, maintenant: Date = new Date()): boolean {
  return jourISO(checkOut) < aujourdhuiMaroc(maintenant);
}
