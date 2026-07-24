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
