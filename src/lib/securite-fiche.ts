import type { SecuriteLogementResume } from "@/lib/security-data";

type Sejour = NonNullable<SecuriteLogementResume["sejour"]>;

// Fiche police à compléter : manquante, lien envoyé mais pas rempli, ou moins de personnes
// enregistrées que de personnes attendues. Jamais pour un blocage ou un séjour famille.
// Module sans dépendance serveur : utilisé à la fois par la page et par la liste (client).
export function ficheACompleter(sejour: Sejour | null): boolean {
  if (!sejour || sejour.fiche === "non_requise") return false;
  if (sejour.fiche !== "complete") return true;
  return sejour.personnesAttendues !== null && sejour.personnesEnregistrees < sejour.personnesAttendues;
}
