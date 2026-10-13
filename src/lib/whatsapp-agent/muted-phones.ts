// Interrupteur général : tant qu'il est à true, le webhook WhatsApp n'envoie plus aucune réponse
// automatique à personne (clients, personnel, techniciens). Kamel, 2026-10-13 : "l'ia ne repond
// plus a personne stp car c mon numero perso je veux le supprimer". Repasser à false pour
// réactiver les agents.
export const IA_WHATSAPP_DESACTIVEE = true;

// Numéros pour lesquels aucun agent IA ne répond même quand l'interrupteur général est levé.
const MUTED_PHONES = new Set<string>(["+33651719015"]);

export function isMutedPhone(phone: string): boolean {
  return IA_WHATSAPP_DESACTIVEE || MUTED_PHONES.has(phone);
}
