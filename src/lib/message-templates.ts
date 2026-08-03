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
  wazeUrl: string | null = null,
  lang: MessageLang = "fr"
): string {
  if (lang === "en") {
    const links = wazeUrl ? `🚗 Google Maps: ${mapsUrl}\n🚗 Waze: ${wazeUrl}` : mapsUrl;
    return `Hello ${guestName},\n\nHere is the location of ${domaineNom} for your arrival.\n\n${links}\n\nFeel free to message us if you need help finding the way. See you soon!\n\nKamel, Moderna Agency`;
  }
  const links = wazeUrl ? `🚗 Google Maps : ${mapsUrl}\n🚗 Waze : ${wazeUrl}` : mapsUrl;
  return `Bonjour ${guestName},\n\nVoici la localisation du ${domaineNom} pour votre arrivée.\n\n${links}\n\nN'hésitez pas à nous écrire si vous avez besoin d'aide pour trouver le chemin. À bientôt !\n\nKamel, Moderna Agency`;
}

// Message unique de bienvenue, envoyé une fois que les infos pratiques sont prêtes (guide, code,
// localisation) — remplace la volée de messages fragmentés que Superhote envoie automatiquement
// (formulaire reçu, guide, localisation, règles, procédure d'arrivée en plusieurs messages
// séparés) par un seul message condensé, moins envahissant pour le client. Les champs optionnels
// (code, guide, waze) sont omis proprement s'ils ne sont pas renseignés pour cette villa.
export function buildWelcomeMessage(
  guestName: string,
  villaNom: string,
  mapsUrl: string | null,
  wazeUrl: string | null,
  codeBoitier: string | null,
  guideBienvenueUrl: string | null,
  lang: MessageLang = "fr"
): string {
  if (lang === "en") {
    const lines = [
      `Hello ${guestName}, thank you for your booking at ${villaNom}!`,
      "",
      guideBienvenueUrl ? `📔 Welcome guide: ${guideBienvenueUrl}` : null,
      "🕒 Check-in from 15:00 / Check-out before 11:00",
      mapsUrl || wazeUrl
        ? `📍 Location:${mapsUrl ? ` Maps ${mapsUrl}` : ""}${wazeUrl ? ` — Waze ${wazeUrl}` : ""}`
        : null,
      codeBoitier ? `🔑 Lockbox code: ${codeBoitier}` : null,
      "",
      "Please send us the ID documents of all adult travelers before your arrival (speeds up check-in). A team member will contact you before you arrive to finalize check-in.",
      "",
      "A quick reminder: no parties, no unregistered guests, please leave the place clean and tidy on departure, and no smoking indoors. Any damage will be charged.",
      "",
      "Looking forward to welcoming you! Feel free to message us here for anything.",
    ];
    return lines.filter((l) => l !== null).join("\n");
  }

  const lines = [
    `Bonjour ${guestName}, merci pour votre réservation à ${villaNom} !`,
    "",
    guideBienvenueUrl ? `📔 Guide de bienvenue : ${guideBienvenueUrl}` : null,
    "🕒 Check-in à partir de 15h00 / Check-out avant 11h00",
    mapsUrl || wazeUrl
      ? `📍 Localisation :${mapsUrl ? ` Maps ${mapsUrl}` : ""}${wazeUrl ? ` — Waze ${wazeUrl}` : ""}`
      : null,
    codeBoitier ? `🔑 Code du boîtier à clé : ${codeBoitier}` : null,
    "",
    "Merci de nous envoyer les pièces d'identité de tous les voyageurs adultes avant votre arrivée (accélère l'enregistrement). Un membre de l'équipe vous contactera avant votre arrivée pour finaliser le check-in.",
    "",
    "Petit rappel : pas de soirées ni d'invités non comptés dans la réservation, merci de laisser les lieux propres et rangés au départ, et non-fumeur à l'intérieur. Toute dégradation sera facturée.",
    "",
    "Belle arrivée ! N'hésitez pas à nous écrire ici pour toute question.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

// Message envoyé le matin du départ, avec la procédure de checkout — distinct de
// buildDepartureMessage (qui remercie APRÈS le départ, une fois le client déjà parti).
export function buildCheckoutMessage(guestName: string, villaNom: string, lang: MessageLang = "fr"): string {
  if (lang === "en") {
    return `Hello ${guestName},\n\nWe hope you enjoyed your stay at ${villaNom}!\n\nCheck-out is at 11:00 AM at the latest. Before you leave:\n\n1. Gather the trash in the kitchen bag\n2. Leave towels on the beds, sorted by room\n3. Turn off lights and AC\n4. Lock the door by 11:00 AM\n5. Drop the keys in the lockbox (or contact us)\n6. Take your car out of the parking spot\n\nAny question before you go? We're here. Thank you and see you soon!\nModerna Agency Team`;
  }
  return `Bonjour ${guestName},\n\nNous espérons que votre séjour à ${villaNom} s'est bien passé !\n\nDépart à 11h00 maximum. Avant de partir :\n\n1. Regrouper les ordures dans le sac poubelle de la cuisine\n2. Regrouper les serviettes par chambre sur le lit\n3. Éteindre les lumières et la climatisation\n4. Fermer la porte à clé à 11h00 maximum\n5. Déposer les clés dans la boîte à clé (ou nous contacter)\n6. Sortir votre véhicule du parking\n\nUne question avant de partir ? On est là. Merci et à bientôt !\nL'équipe Moderna Agency`;
}

// Message envoyé après le départ du client : remercie et souhaite un bon voyage, sans rien
// demander en retour — contrairement au message d'arrivée, purement une formule de politesse.
export function buildDepartureMessage(guestName: string, lang: MessageLang = "fr"): string {
  if (lang === "en") {
    return `Hello ${guestName},\n\nThank you very much for your stay with us. We hope you had a wonderful time and a safe trip back.\n\nIt was a pleasure hosting you, and we hope to welcome you again soon!\n\nKamel, Moderna Agency`;
  }
  return `Bonjour ${guestName},\n\nMerci beaucoup pour votre séjour parmi nous. Nous espérons que vous avez passé un excellent moment et que vous avez fait bon voyage.\n\nCe fut un plaisir de vous accueillir, et nous espérons vous revoir bientôt !\n\nKamel, Moderna Agency`;
}

// Message envoyé au gardien/sécurité du domaine (en arabe, car ils ne lisent pas le français) :
// prévient de l'arrivée d'un client et transmet le lien de la fiche des occupants.
export function buildSecurityMessage(guestName: string, villaNom: string, villaNumero: string, link: string): string {
  return `السلام عليكم،\n\nضيف جديد (${guestName}) سيصل إلى ${villaNom} (فيلا رقم ${villaNumero}).\n\nهذا رابط الأمن الخاص بمعلومات الضيوف:\n\n${link}\n\nشكرا`;
}
