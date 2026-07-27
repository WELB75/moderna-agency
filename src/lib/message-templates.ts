import { isSameDay, addDays, format } from "date-fns";
import { fr, enUS } from "date-fns/locale";

export type MessageLang = "fr" | "en";

// Message unique envoyé au client avant son arrivée : demande l'horaire, et transmet le lien
// de la fiche de police dans le même message si elle n'est pas déjà complétée (un seul message
// plutôt que deux, un seul bouton à cliquer). Le "quand" s'adapte à la date réelle (comparée à
// l'heure marocaine passée en "now", pas l'heure serveur) pour rester juste si envoyé à l'avance.
// Salutation neutre ("Bonjour"/"Hello") plutôt que religieuse : tous les clients ne sont pas
// musulmans. Existe en français et en anglais, au choix, pour les clients non-francophones.
export function buildArrivalMessage(
  guestName: string,
  checkIn: Date,
  now: Date,
  ficheLink: string | null,
  lang: MessageLang = "fr"
): string {
  if (lang === "en") {
    const when = isSameDay(checkIn, now)
      ? "today"
      : isSameDay(checkIn, addDays(now, 1))
        ? "tomorrow"
        : `on ${format(checkIn, "MMMM d", { locale: enUS })}`;

    const base = `Hello ${guestName},\n\nI hope you are doing well.\n\nThis is Kamel, regarding your check-in ${when}.\n\nDo you have an idea of your arrival time at the villa?`;

    if (!ficheLink) return `${base}\n\nThank you,\nKamel, Moderna Agency`;

    return `${base}\n\nI'm also sending you the link to fill in the police registration form, required for the security of the domain and to protect you as well as the owner:\n\n${ficheLink}\n\nThank you,\nKamel, Moderna Agency`;
  }

  const quand = isSameDay(checkIn, now)
    ? "d'aujourd'hui"
    : isSameDay(checkIn, addDays(now, 1))
      ? "de demain"
      : `du ${format(checkIn, "d MMMM", { locale: fr })}`;

  const base = `Bonjour ${guestName},\n\nJ'espère que vous allez bien.\n\nC'est Kamel, pour votre check-in ${quand}.\n\nAvez-vous une idée de votre horaire d'arrivée à la villa ?`;

  if (!ficheLink) return `${base}\n\nMerci,\nKamel, Moderna Agency`;

  return `${base}\n\nJe vous transmets aussi le lien pour compléter la fiche de police, nécessaire pour la sécurité du domaine et pour vous protéger ainsi que le propriétaire :\n\n${ficheLink}\n\nMerci,\nKamel, Moderna Agency`;
}

// Message envoyé avec la localisation du domaine, pour que le client trouve facilement le
// chemin le jour de son arrivée. Disponible en français et en anglais.
export function buildLocationMessage(
  guestName: string,
  domaineNom: string,
  mapsUrl: string,
  lang: MessageLang = "fr"
): string {
  if (lang === "en") {
    return `Hello ${guestName},\n\nHere is the location of ${domaineNom} for your arrival.\n\n${mapsUrl}\n\nFeel free to message us if you need help finding the way. See you soon!\n\nKamel, Moderna Agency`;
  }
  return `Bonjour ${guestName},\n\nVoici la localisation du ${domaineNom} pour votre arrivée.\n\n${mapsUrl}\n\nN'hésitez pas à nous écrire si vous avez besoin d'aide pour trouver le chemin. À bientôt !\n\nKamel, Moderna Agency`;
}

// Message envoyé au gardien/sécurité du domaine (en arabe, car ils ne lisent pas le français) :
// prévient de l'arrivée d'un client et transmet le lien de la fiche des occupants.
export function buildSecurityMessage(guestName: string, villaNom: string, villaNumero: string, link: string): string {
  return `السلام عليكم،\n\nضيف جديد (${guestName}) سيصل إلى ${villaNom} (فيلا رقم ${villaNumero}).\n\nهذا رابط الأمن الخاص بمعلومات الضيوف:\n\n${link}\n\nشكرا`;
}
