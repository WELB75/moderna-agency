// Jeton(s) pour l'espace maintenance public (/m/[token]) — pas de connexion requise, même
// principe que le lien public de planning équipe (voir planning-token.ts), mais celui-ci couvre
// toutes les villas et permet la modification (statut, urgence, catégorie, technicien, notes,
// photos). Vérifié à la fois côté page (affichage) et côté chaque action serveur (mutation) — ne
// jamais faire confiance uniquement au rendu de la page.
// MAINTENANCE_ACCESS_TOKEN reste le jeton partagé historique ; les variables
// MAINTENANCE_ACCESS_TOKEN_<NOM> ci-dessous donnent des codes personnels à une personne précise
// (ex. Imed) sans changer le lien déjà utilisé par le reste de l'équipe.
export function isValidMaintenanceToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const validTokens = [process.env.MAINTENANCE_ACCESS_TOKEN, process.env.MAINTENANCE_ACCESS_TOKEN_IMED].filter(
    Boolean
  );
  return validTokens.includes(token);
}
