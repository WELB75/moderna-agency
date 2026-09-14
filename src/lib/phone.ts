// Convertit un numéro (local marocain "06...", international "+33...", "00...")
// en lien wa.me utilisable directement pour ouvrir une discussion WhatsApp. Un message
// optionnel est pré-rempli dans le champ de saisie (encore modifiable avant l'envoi).
export function toWhatsAppUrl(rawPhone: string, message?: string): string {
  let normalized = rawPhone.replace(/[^\d+]/g, "");

  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith("0")) {
    normalized = `+212${normalized.slice(1)}`;
  } else if (!normalized.startsWith("+")) {
    // Un numéro local marocain/français sans le 0 initial tient sur 9 chiffres (ex. "661757246").
    // Au-delà, le numéro contient déjà un indicatif pays saisi sans le "+" (ex. "33681818100") —
    // le préfixer avec +212 ajouterait un second indicatif au lieu de corriger le premier.
    normalized = normalized.length > 9 ? `+${normalized}` : `+212${normalized}`;
  }

  const base = `https://wa.me/${normalized.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// Compare deux numéros en ignorant l'indicatif pays / le 0 initial (formats mélangés :
// "0681818100" vs "+33681818100" vs "0033681818100" doivent être reconnus comme identiques).
// Utilisé pour détecter qu'un "client" est en fait le propriétaire réservant sa propre villa.
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const tailA = a.replace(/\D/g, "").slice(-9);
  const tailB = b.replace(/\D/g, "").slice(-9);
  return tailA.length === 9 && tailA === tailB;
}
