// Jeton unique partagé pour le lien public de planning équipe (/planning/[token]) — pas de
// connexion requise, sur le même principe que les liens sécurité/propriétaire déjà publics dans
// l'app, mais celui-ci permet aussi la modification (réaffectation). Vérifié à la fois côté page
// (affichage) et côté chaque action serveur (mutation) — ne jamais faire confiance uniquement au
// rendu de la page, une Server Action reste appelable directement sans repasser par elle.
export function isValidPlanningToken(token: string | undefined | null): boolean {
  const expected = process.env.PLANNING_ACCESS_TOKEN;
  return Boolean(expected) && token === expected;
}
