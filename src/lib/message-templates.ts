import { isSameDay, addDays, format } from "date-fns";
import { fr } from "date-fns/locale";

// Message envoyé systématiquement au client avant son arrivée, pour connaître son horaire —
// le "quand" s'adapte à la date réelle (comparée à l'heure marocaine passée en "now", pas
// l'heure serveur) pour rester juste si envoyé plus d'un jour à l'avance.
export function buildCheckinReminderMessage(guestName: string, checkIn: Date, now: Date): string {
  const quand = isSameDay(checkIn, now)
    ? "d'aujourd'hui"
    : isSameDay(checkIn, addDays(now, 1))
      ? "de demain"
      : `du ${format(checkIn, "d MMMM", { locale: fr })}`;

  return `Salam ${guestName},\n\nEn espérant que vous allez bien ?\n\nC'est Kamel pour votre check-in ${quand} in sha-a Allah.\n\nAvez-vous une idée sur votre horaire d'arrivée à la Villa ? Merci.`;
}

// Message envoyé avec le lien de la fiche de police, à demander avant l'arrivée — toujours
// signé au nom de l'agence (pas juste "Kamel"), pour rester officiel sur ce sujet sécurité.
export function buildFichePoliceMessage(guestName: string, link: string): string {
  return `Bonjour ${guestName},\n\nJe vous prépare le lien pour compléter la fiche de police, nécessaire pour la sécurité du domaine et pour vous protéger ainsi que le propriétaire.\n\n${link}\n\nMerci,\nKamel, Moderna Agency`;
}
