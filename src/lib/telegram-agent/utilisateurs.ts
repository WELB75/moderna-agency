// Personnes autorisées à parler à l'assistant Telegram.
//
// TELEGRAM_ALLOWED_USER_ID : liste d'identifiants Telegram séparés par une virgule. Le premier est
// celui de Kamel (le principal : rappels, notifications, "loyers perso"). Chaque entrée peut porter
// un prénom : "123456,9208341954:Fouad". Sans prénom, Kamel est nommé "Kamel" et les autres
// reprennent leur prénom Telegram.
//
// 2026-11-02, Kamel : Fouad doit avoir accès à tout, comme lui, et en plus à toutes les
// réservations (appartements et villas). Les personnes listées après Kamel ont donc les mêmes
// droits (y compris "loyers perso"), ne subissent pas le masquage de domaine (Noria) du programme
// et du solde de caisse, et reçoivent aussi les rappels et notifications.

export type UtilisateurTelegram = {
  id: string;
  nom: string;
  principal: boolean;
  // Voit aussi les domaines mis de côté (Noria) dans le programme du jour et le solde de caisse.
  voirTout: boolean;
  // Valeur de createdByUserId dans la caisse. Le principal garde "telegram-agent" (historique), les
  // autres ont la leur : "annuler" ne touche ainsi que les mouvements de la personne qui parle.
  auteurId: string;
};

function entrees(env: string | undefined): { id: string; nom: string | null }[] {
  return (env ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [id, ...reste] = e.split(":");
      return { id: id.trim(), nom: reste.join(":").trim() || null };
    })
    .filter((e) => e.id);
}

export function trouverUtilisateur(
  fromId: string,
  prenomTelegram: string | null | undefined,
  env: string | undefined = process.env.TELEGRAM_ALLOWED_USER_ID,
): UtilisateurTelegram | null {
  const liste = entrees(env);
  const index = liste.findIndex((e) => e.id === fromId);
  if (index === -1) return null;
  const principal = index === 0;
  const nom = liste[index].nom ?? (principal ? "Kamel" : prenomTelegram?.trim() || "Équipe");
  return { id: fromId, nom, principal, voirTout: !principal, auteurId: principal ? "telegram-agent" : `telegram-agent:${fromId}` };
}

// Identifiants de toutes les personnes autorisées : destinataires des rappels et notifications.
export function idsAutorises(env: string | undefined = process.env.TELEGRAM_ALLOWED_USER_ID): string[] {
  return entrees(env).map((e) => e.id);
}

// Utilisateur par défaut (comportement historique, Kamel seul).
export const UTILISATEUR_PRINCIPAL: UtilisateurTelegram = { id: "", nom: "Kamel", principal: true, voirTout: false, auteurId: "telegram-agent" };
