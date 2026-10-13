// Numéros pour lesquels aucun agent IA ne répond : le message entrant est journalisé (visible
// dans /chat) mais le webhook s'arrête là. Kamel, 2026-10-13 : "dis a l'agent ia d'arreter de
// repondre avec mon numero desactive l'ia" (son second numéro, +33651719015).
const MUTED_PHONES = new Set<string>(["+33651719015"]);

export function isMutedPhone(phone: string): boolean {
  return MUTED_PHONES.has(phone);
}
