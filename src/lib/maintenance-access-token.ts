// Jeton unique partagé pour l'espace maintenance public (/m/[token]) — pas de connexion
// requise, même principe que le lien public de planning équipe (voir planning-token.ts), mais
// celui-ci couvre toutes les villas et permet la modification (statut, urgence, catégorie,
// technicien, notes, photos). Vérifié à la fois côté page (affichage) et côté chaque action
// serveur (mutation) — ne jamais faire confiance uniquement au rendu de la page.
export function isValidMaintenanceToken(token: string | undefined | null): boolean {
  const expected = process.env.MAINTENANCE_ACCESS_TOKEN;
  return Boolean(expected) && token === expected;
}
