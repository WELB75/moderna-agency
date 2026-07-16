// Convertit un numéro (local marocain "06...", international "+33...", "00...")
// en lien wa.me utilisable directement pour ouvrir une discussion WhatsApp.
export function toWhatsAppUrl(rawPhone: string): string {
  let normalized = rawPhone.replace(/[^\d+]/g, "");

  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  } else if (normalized.startsWith("0")) {
    normalized = `+212${normalized.slice(1)}`;
  } else if (!normalized.startsWith("+")) {
    normalized = `+212${normalized}`;
  }

  return `https://wa.me/${normalized.replace(/\D/g, "")}`;
}
