import { isSameDay, addDays, format } from "date-fns";
import { fr } from "date-fns/locale";

// Message unique envoyé au client avant son arrivée : demande l'horaire, et transmet le lien
// de la fiche de police dans le même message si elle n'est pas déjà complétée (un seul message
// plutôt que deux, un seul bouton à cliquer). Le "quand" s'adapte à la date réelle (comparée à
// l'heure marocaine passée en "now", pas l'heure serveur) pour rester juste si envoyé à l'avance.
export function buildArrivalMessage(guestName: string, checkIn: Date, now: Date, ficheLink: string | null): string {
  const quand = isSameDay(checkIn, now)
    ? "d'aujourd'hui"
    : isSameDay(checkIn, addDays(now, 1))
      ? "de demain"
      : `du ${format(checkIn, "d MMMM", { locale: fr })}`;

  const base = `Salam ${guestName},\n\nEn espérant que vous allez bien ?\n\nC'est Kamel pour votre check-in ${quand} in sha-a Allah.\n\nAvez-vous une idée sur votre horaire d'arrivée à la Villa ?`;

  if (!ficheLink) return `${base} Merci.`;

  return `${base}\n\nJe vous transmets aussi le lien pour compléter la fiche de police, nécessaire pour la sécurité du domaine et pour vous protéger ainsi que le propriétaire :\n\n${ficheLink}\n\nMerci,\nKamel, Moderna Agency`;
}

// Message envoyé avec la localisation du domaine, pour que le client trouve facilement le
// chemin le jour de son arrivée.
export function buildLocationMessage(guestName: string, domaineNom: string, mapsUrl: string): string {
  return `Bonjour ${guestName},\n\nVoici la localisation du ${domaineNom} pour votre arrivée.\n\n${mapsUrl}\n\nN'hésitez pas à nous écrire si vous avez besoin d'aide pour trouver le chemin. À bientôt !\n\nKamel, Moderna Agency`;
}
