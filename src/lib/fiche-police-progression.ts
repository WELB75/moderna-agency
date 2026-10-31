// Règle de complétion de la fiche police « voyageur par voyageur » (Fouad, 2026-10-31) : la fiche
// est terminée quand tous les adultes attendus sont enregistrés. Sans nombre attendu connu (fiche
// libre sans réservation), un seul adulte enregistré suffit, comme avant.
export function ficheTerminee(recus: number, attendus: number | null): boolean {
  return attendus && attendus > 0 ? recus >= attendus : recus > 0;
}

// Nombre de passeports qu'il manque encore (null si le nombre attendu est inconnu).
export function passeportsManquants(recus: number, attendus: number | null): number | null {
  return attendus && attendus > 0 ? Math.max(0, attendus - recus) : null;
}
