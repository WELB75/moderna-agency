// Conditions de séjour (remplacent l'ancien contrat de location en 13 articles) — Fouad,
// 2026-10-18 : "le contrat de location faudra le simplifier [...] vazy fais le". Une page, deux
// variantes :
// - réservation Airbnb / Booking.com : le prix, le paiement et l'annulation sont ceux de la
//   plateforme, on ne les répète pas (l'ancien contrat affichait "acompte = total, solde 0" et des
//   clauses de remboursement contraires aux règles des plateformes) ;
// - réservation directe : prix, acompte, solde et annulation.
// Le texte est signé par le voyageur à la fin de la fiche police (/g/[id]), dans la langue qu'il a
// choisie ; la version française fait foi. Aucun champ vide ("……") : une donnée inconnue fait
// simplement disparaître la phrase correspondante.
//
// Module pur (pas d'accès base) : partagé entre serveur et client.

import type { GendarmerieLang } from "@/lib/gendarmerie-i18n";
import { AGENCE_ADRESSE, AGENCE_NOM } from "@/lib/contrat-template";

export type ConditionsLang = GendarmerieLang;

export type ConditionsSejourData = {
  locataireNom: string | null;
  // Numéro de la pièce d'identité (CIN / passeport) du locataire, repris de la fiche police : le
  // client n'a rien à saisir, et l'agence sait exactement qui a signé.
  locatairePiece?: string | null;
  logement: string; // "Villa Tania (n°3)"
  adresse: string; // jamais vide (repli sur le domaine, puis "Marrakech")
  dateArrivee: string | null; // YYYY-MM-DD
  dateDepart: string | null; // YYYY-MM-DD
  nbAdultes: number | null;
  nbEnfants: number | null;
  canal: string | null; // libellé de l'app : "Airbnb", "Booking.com", "Direct"...
  devise: string; // devise du loyer (EUR, DH...)
  montantTotal: string | null;
  acompteMontant: string | null;
  soldeMontant: string | null;
  soldeDateLimite: string | null; // YYYY-MM-DD
  cautionMontant: string | null;
  cautionDevise: string;
};

export type ConditionsSection = { titre: string; lignes: string[] };

export type ConditionsSejour = {
  titre: string;
  intro: string;
  sections: ConditionsSection[];
  mention: string | null; // "traduction pour information" hors français
};

// Séjour sans voyageur à enregistrer : blocages (assistant "Blocage · …", "Blocage Airbnb",
// dates fermées iCal, travaux) et séjours "Famille" — ni fiche police ni conditions de séjour.
// Même esprit que aSuivre() dans suivi-arrivees.tsx et estBlocage() dans security-data.ts, avec
// en plus les réservations Beds24 nommées "Travaux …" (ex. "Travaux Azur", fiche police créée
// pour rien à la synchro du 13/10/2026).
const NOM_SANS_VOYAGEUR = /^(blocage|date bloqu|not available|blocked|indisponible|travaux)/i;

// Séjours du propriétaire d'une villa (ex. Youssef Mouani, propriétaire de Villa Sofya — Kamel,
// 2026-10-18) : pas de prix, de caution, de contrat ni de fiche police.
const NOM_PROPRIETAIRE = /^youssef\s+mouani\b/i;

export function estSejourProprietaire(guestName: string): boolean {
  return NOM_PROPRIETAIRE.test(guestName.trim());
}

export function sejourSansVoyageur(r: { canal: string | null; guestName: string }): boolean {
  const canal = r.canal ?? "";
  return canal.startsWith("Blocage") || canal === "Famille" || NOM_SANS_VOYAGEUR.test(r.guestName.trim()) || estSejourProprietaire(r.guestName);
}

// Plateforme de réservation (Airbnb, Booking.com, autre OTA) ; null pour une réservation directe.
export function plateformeDe(canal: string | null | undefined): string | null {
  const c = (canal ?? "").trim();
  const lower = c.toLowerCase();
  if (!c || lower === "direct" || lower === "manuel" || lower === "famille" || lower.startsWith("blocage")) return null;
  if (lower.includes("airbnb")) return "Airbnb";
  if (lower.includes("booking")) return "Booking.com";
  return c;
}

const LOCALES: Record<ConditionsLang, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
  ar: "ar-MA",
  nl: "nl-NL",
};

function formatDate(value: string | null, lang: ConditionsLang): string | null {
  const match = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value?.trim() ? value.trim() : null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const texte = new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  // "1 novembre" -> "1er novembre"
  return lang === "fr" ? texte.replace(/^1 /, "1er ") : texte;
}

// "de Booking.com", mais "d'Airbnb".
function deFr(nom: string): string {
  return /^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/.test(nom) ? `d'${nom}` : `de ${nom}`;
}

const DEVISES_ISO = new Set(["EUR", "USD", "GBP", "MAD"]);

export function formatMontant(value: string | null, devise: string, lang: ConditionsLang = "fr"): string | null {
  const brut = (value ?? "").trim();
  if (!brut) return null;
  const nombre = Number(brut.replace(",", "."));
  const code = (devise || "").trim().toUpperCase();
  if (!Number.isFinite(nombre)) return `${brut} ${devise}`.trim();
  if (DEVISES_ISO.has(code)) {
    return new Intl.NumberFormat(LOCALES[lang], {
      style: "currency",
      currency: code,
      maximumFractionDigits: Number.isInteger(nombre) ? 0 : 2,
    }).format(nombre);
  }
  const texte = new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 2 }).format(nombre);
  return `${texte} ${code === "DH" ? "DH" : devise}`.trim();
}

function montantPositif(value: string | null): boolean {
  const n = Number((value ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0;
}

type Champs = {
  nom: string | null;
  logement: string;
  adresse: string;
  arrivee: string | null;
  depart: string | null;
  adultes: number | null;
  enfants: number | null;
  plateforme: string | null;
  total: string | null;
  acompte: string | null;
  solde: string | null;
  soldeDate: string | null;
  caution: string | null;
};

type Textes = {
  titre: string;
  intro: (nom: string | null) => string;
  sejour: {
    titre: string;
    logement: (logement: string, adresse: string) => string;
    dates: (arrivee: string, depart: string) => string;
    datesInconnues: string;
    voyageurs: (adultes: number, enfants: number) => string;
    agence: string;
  };
  paiement: {
    titre: string;
    plateforme: (p: string) => string;
    total: (m: string) => string;
    acompte: (m: string) => string;
    solde: (m: string, date: string | null) => string;
    annulation: string;
    convenu: string;
  };
  occupants: { titre: string; lignes: string[] };
  regles: { titre: string; lignes: string[] };
  securite: { titre: string; lignes: string[] };
  degats: {
    titre: string;
    responsabilite: string;
    caution: (m: string) => string;
    procedurePlateforme: (p: string) => string;
    objets: string;
  };
  manquement: { titre: string; ligne: string };
  droit: { titre: string; ligne: string };
  mention: string | null;
};

const TEXTES: Record<ConditionsLang, Textes> = {
  fr: {
    titre: "Conditions de séjour",
    intro: (nom) =>
      `Entre ${AGENCE_NOM} (${AGENCE_ADRESSE}), qui gère le logement pour le compte de son propriétaire (« l'Agence »), et ${nom ?? "le locataire"} (« le Locataire »), qui accepte ces conditions pour lui-même et pour toutes les personnes qui séjournent avec lui.`,
    sejour: {
      titre: "1. Le séjour",
      logement: (l, a) => `Logement : ${l}, ${a}.`,
      dates: (a, d) => `Du ${a} au ${d}.`,
      datesInconnues: "Aux dates de la réservation.",
      voyageurs: (a, e) =>
        `Voyageurs : ${a} adulte${a > 1 ? "s" : ""}${e > 0 ? `, ${e} enfant${e > 1 ? "s" : ""}` : ""}.`,
      agence: "L'Agence remet le logement propre et en bon état, et intervient pour toute panne qui n'est pas due au Locataire.",
    },
    paiement: {
      titre: "2. Prix et paiement",
      plateforme: (p) =>
        `Réservation faite sur ${p} : le prix, le paiement et les conditions d'annulation sont ceux ${deFr(p)}. Les présentes conditions s'y ajoutent.`,
      total: (m) => `Prix total : ${m}.`,
      acompte: (m) => `Acompte versé : ${m}.`,
      solde: (m, d) =>
        `Solde : ${m}, à régler ${d ? `au plus tard le ${d}` : "avant l'arrivée"}. Les clés ne sont remises qu'après paiement complet.`,
      annulation: "En cas d'annulation par le Locataire, l'acompte n'est pas remboursé.",
      convenu: "Le prix et les modalités de paiement sont ceux convenus lors de la réservation.",
    },
    occupants: {
      titre: "3. Occupants",
      lignes: [
        "Seules les personnes déclarées dans la fiche de police peuvent séjourner dans le logement ou y entrer. Tout visiteur supplémentaire doit être accepté à l'avance et par écrit par l'Agence.",
      ],
    },
    regles: {
      titre: "4. Règles de la maison",
      lignes: [
        "Pas de fête ni d'événement sans l'accord écrit de l'Agence.",
        "Pas d'animaux.",
        "Ne pas fumer à l'intérieur.",
        "Respecter le voisinage et le calme, en particulier la nuit.",
        "Respecter la loi marocaine et l'ordre public.",
        "Ne pas sous-louer le logement.",
      ],
    },
    securite: {
      titre: "5. Sécurité",
      lignes: [
        "Les enfants restent sous la surveillance d'un adulte en permanence, en particulier près de la piscine.",
        "Les consignes de sécurité affichées dans le logement doivent être respectées.",
      ],
    },
    degats: {
      titre: "6. Dégâts et caution",
      responsabilite:
        "Le Locataire répond des dégâts causés par lui-même ou par son groupe et les signale à l'Agence dès qu'ils se produisent.",
      caution: (m) =>
        `Une caution de ${m} est demandée avant l'arrivée (empreinte bancaire ou dépôt). Elle est rendue après l'état des lieux de sortie, déduction faite des éventuels dégâts.`,
      procedurePlateforme: (p) => `Les éventuels dégâts sont réglés selon la procédure ${deFr(p)}.`,
      objets:
        "L'Agence n'est pas responsable des objets personnels perdus ou volés, ni des coupures d'eau, d'électricité ou d'internet qui ne dépendent pas d'elle.",
    },
    manquement: {
      titre: "7. Manquement grave",
      ligne:
        "En cas de manquement grave à ces conditions (fête, personnes non déclarées, comportement illégal), l'Agence peut mettre fin au séjour.",
    },
    droit: {
      titre: "8. Droit applicable",
      ligne: "Ces conditions sont régies par le droit marocain. Tout litige relève des tribunaux de Marrakech.",
    },
    mention: null,
  },
  en: {
    titre: "Terms of stay",
    intro: (nom) =>
      `Between ${AGENCE_NOM} (${AGENCE_ADRESSE}), which manages the property on behalf of its owner (“the Agency”), and ${nom ?? "the guest"} (“the Guest”), who accepts these terms for themselves and for everyone staying with them.`,
    sejour: {
      titre: "1. The stay",
      logement: (l, a) => `Property: ${l}, ${a}.`,
      dates: (a, d) => `From ${a} to ${d}.`,
      datesInconnues: "On the dates of the booking.",
      voyageurs: (a, e) =>
        `Guests: ${a} adult${a > 1 ? "s" : ""}${e > 0 ? `, ${e} ${e > 1 ? "children" : "child"}` : ""}.`,
      agence: "The Agency hands over the property clean and in good condition, and fixes any breakdown not caused by the Guest.",
    },
    paiement: {
      titre: "2. Price and payment",
      plateforme: (p) =>
        `Booked on ${p}: the price, payment and cancellation terms are those of ${p}. These terms apply in addition.`,
      total: (m) => `Total price: ${m}.`,
      acompte: (m) => `Down payment paid: ${m}.`,
      solde: (m, d) =>
        `Balance: ${m}, payable ${d ? `by ${d}` : "before arrival"}. Keys are handed over only once paid in full.`,
      annulation: "If the Guest cancels, the down payment is not refunded.",
      convenu: "The price and payment terms are those agreed at booking.",
    },
    occupants: {
      titre: "3. Occupants",
      lignes: [
        "Only the people declared in the police registration form may stay in or enter the property. Any additional visitor must be approved in advance and in writing by the Agency.",
      ],
    },
    regles: {
      titre: "4. House rules",
      lignes: [
        "No parties or events without the Agency's written consent.",
        "No pets.",
        "No smoking indoors.",
        "Respect the neighbours and keep noise down, especially at night.",
        "Respect Moroccan law and public order.",
        "Do not sublet the property.",
      ],
    },
    securite: {
      titre: "5. Safety",
      lignes: [
        "Children must be supervised by an adult at all times, especially near the pool.",
        "The safety instructions displayed in the property must be followed.",
      ],
    },
    degats: {
      titre: "6. Damage and security deposit",
      responsabilite:
        "The Guest is liable for any damage caused by themselves or their group and reports it to the Agency as soon as it happens.",
      caution: (m) =>
        `A security deposit of ${m} is required before arrival (card pre-authorisation or deposit). It is returned after the check-out inspection, minus any damage.`,
      procedurePlateforme: (p) => `Any damage is settled through ${p}'s procedure.`,
      objets:
        "The Agency is not liable for lost or stolen personal belongings, or for water, power or internet outages beyond its control.",
    },
    manquement: {
      titre: "7. Serious breach",
      ligne:
        "In the event of a serious breach of these terms (party, undeclared guests, illegal behaviour), the Agency may end the stay.",
    },
    droit: {
      titre: "8. Governing law",
      ligne: "These terms are governed by Moroccan law. Any dispute falls under the jurisdiction of the courts of Marrakech.",
    },
    mention: "Translation for information only — the French version prevails.",
  },
  es: {
    titre: "Condiciones de estancia",
    intro: (nom) =>
      `Entre ${AGENCE_NOM} (${AGENCE_ADRESSE}), que gestiona el alojamiento por cuenta de su propietario («la Agencia»), y ${nom ?? "el huésped"} («el Huésped»), que acepta estas condiciones para sí mismo y para todas las personas que se alojan con él.`,
    sejour: {
      titre: "1. La estancia",
      logement: (l, a) => `Alojamiento: ${l}, ${a}.`,
      dates: (a, d) => `Del ${a} al ${d}.`,
      datesInconnues: "En las fechas de la reserva.",
      voyageurs: (a, e) =>
        `Huéspedes: ${a} adulto${a > 1 ? "s" : ""}${e > 0 ? `, ${e} niño${e > 1 ? "s" : ""}` : ""}.`,
      agence: "La Agencia entrega el alojamiento limpio y en buen estado, y repara cualquier avería que no haya causado el Huésped.",
    },
    paiement: {
      titre: "2. Precio y pago",
      plateforme: (p) =>
        `Reserva realizada en ${p}: el precio, el pago y las condiciones de cancelación son los de ${p}. Estas condiciones se suman a ellos.`,
      total: (m) => `Precio total: ${m}.`,
      acompte: (m) => `Anticipo pagado: ${m}.`,
      solde: (m, d) =>
        `Saldo: ${m}, a pagar ${d ? `a más tardar el ${d}` : "antes de la llegada"}. Las llaves solo se entregan tras el pago completo.`,
      annulation: "Si el Huésped cancela, el anticipo no se reembolsa.",
      convenu: "El precio y las condiciones de pago son los acordados en la reserva.",
    },
    occupants: {
      titre: "3. Ocupantes",
      lignes: [
        "Solo las personas declaradas en la ficha policial pueden alojarse en el alojamiento o entrar en él. Cualquier visitante adicional debe ser aceptado previamente y por escrito por la Agencia.",
      ],
    },
    regles: {
      titre: "4. Normas de la casa",
      lignes: [
        "No se permiten fiestas ni eventos sin el acuerdo escrito de la Agencia.",
        "No se admiten animales.",
        "No fumar en el interior.",
        "Respetar a los vecinos y la tranquilidad, sobre todo por la noche.",
        "Respetar la ley marroquí y el orden público.",
        "No subarrendar el alojamiento.",
      ],
    },
    securite: {
      titre: "5. Seguridad",
      lignes: [
        "Los niños deben estar vigilados por un adulto en todo momento, especialmente cerca de la piscina.",
        "Deben respetarse las instrucciones de seguridad indicadas en el alojamiento.",
      ],
    },
    degats: {
      titre: "6. Daños y fianza",
      responsabilite:
        "El Huésped responde de los daños causados por él o por su grupo y los comunica a la Agencia en cuanto se producen.",
      caution: (m) =>
        `Se solicita una fianza de ${m} antes de la llegada (preautorización bancaria o depósito). Se devuelve tras la revisión de salida, descontando los posibles daños.`,
      procedurePlateforme: (p) => `Los posibles daños se resuelven según el procedimiento de ${p}.`,
      objets:
        "La Agencia no se hace responsable de objetos personales perdidos o robados, ni de cortes de agua, electricidad o internet ajenos a su control.",
    },
    manquement: {
      titre: "7. Incumplimiento grave",
      ligne:
        "En caso de incumplimiento grave de estas condiciones (fiesta, personas no declaradas, comportamiento ilegal), la Agencia puede poner fin a la estancia.",
    },
    droit: {
      titre: "8. Ley aplicable",
      ligne: "Estas condiciones se rigen por el derecho marroquí. Cualquier litigio corresponde a los tribunales de Marrakech.",
    },
    mention: "Traducción a título informativo: prevalece la versión francesa.",
  },
  nl: {
    titre: "Verblijfsvoorwaarden",
    intro: (nom) =>
      `Tussen ${AGENCE_NOM} (${AGENCE_ADRESSE}), dat de accommodatie beheert namens de eigenaar („het Agentschap”), en ${nom ?? "de huurder"} („de Huurder”), die deze voorwaarden aanvaardt voor zichzelf en voor iedereen die met hem verblijft.`,
    sejour: {
      titre: "1. Het verblijf",
      logement: (l, a) => `Accommodatie: ${l}, ${a}.`,
      dates: (a, d) => `Van ${a} tot ${d}.`,
      datesInconnues: "Op de data van de boeking.",
      voyageurs: (a, e) =>
        `Gasten: ${a} volwassene${a > 1 ? "n" : ""}${e > 0 ? `, ${e} kind${e > 1 ? "eren" : ""}` : ""}.`,
      agence: "Het Agentschap levert de accommodatie schoon en in goede staat op en verhelpt elke storing die niet door de Huurder is veroorzaakt.",
    },
    paiement: {
      titre: "2. Prijs en betaling",
      plateforme: (p) =>
        `Geboekt via ${p}: de prijs, de betaling en de annuleringsvoorwaarden zijn die van ${p}. Deze voorwaarden gelden daarnaast.`,
      total: (m) => `Totale prijs: ${m}.`,
      acompte: (m) => `Betaald voorschot: ${m}.`,
      solde: (m, d) =>
        `Saldo: ${m}, te betalen ${d ? `uiterlijk op ${d}` : "vóór aankomst"}. De sleutels worden pas na volledige betaling overhandigd.`,
      annulation: "Bij annulering door de Huurder wordt het voorschot niet terugbetaald.",
      convenu: "De prijs en de betalingsvoorwaarden zijn die welke bij de boeking zijn afgesproken.",
    },
    occupants: {
      titre: "3. Bewoners",
      lignes: [
        "Alleen de personen die op het politieformulier staan, mogen in de accommodatie verblijven of er binnenkomen. Elke extra bezoeker moet vooraf en schriftelijk door het Agentschap worden goedgekeurd.",
      ],
    },
    regles: {
      titre: "4. Huisregels",
      lignes: [
        "Geen feesten of evenementen zonder schriftelijke toestemming van het Agentschap.",
        "Geen huisdieren.",
        "Niet roken binnen.",
        "Respecteer de buren en de rust, vooral 's nachts.",
        "Respecteer de Marokkaanse wet en de openbare orde.",
        "De accommodatie niet onderverhuren.",
      ],
    },
    securite: {
      titre: "5. Veiligheid",
      lignes: [
        "Kinderen staan altijd onder toezicht van een volwassene, vooral bij het zwembad.",
        "De veiligheidsinstructies in de accommodatie moeten worden opgevolgd.",
      ],
    },
    degats: {
      titre: "6. Schade en borg",
      responsabilite:
        "De Huurder is aansprakelijk voor schade die hij of zijn groep veroorzaakt en meldt die meteen aan het Agentschap.",
      caution: (m) =>
        `Vóór aankomst wordt een borg van ${m} gevraagd (vooraf geautoriseerd op de bankkaart of gestort). Deze wordt na de inspectie bij vertrek terugbetaald, verminderd met eventuele schade.`,
      procedurePlateforme: (p) => `Eventuele schade wordt afgehandeld volgens de procedure van ${p}.`,
      objets:
        "Het Agentschap is niet aansprakelijk voor verloren of gestolen persoonlijke bezittingen, noch voor onderbrekingen van water, elektriciteit of internet buiten zijn macht.",
    },
    manquement: {
      titre: "7. Ernstige tekortkoming",
      ligne:
        "Bij een ernstige schending van deze voorwaarden (feest, niet-aangemelde personen, illegaal gedrag) kan het Agentschap het verblijf beëindigen.",
    },
    droit: {
      titre: "8. Toepasselijk recht",
      ligne: "Op deze voorwaarden is het Marokkaanse recht van toepassing. Geschillen vallen onder de rechtbanken van Marrakech.",
    },
    mention: "Vertaling ter informatie: de Franse versie is bindend.",
  },
  ar: {
    titre: "شروط الإقامة",
    intro: (nom) =>
      `بين ${AGENCE_NOM} (${AGENCE_ADRESSE})، التي تدير المسكن لحساب مالكه («الوكالة»)، و${nom ?? "المستأجر"} («المستأجر»)، الذي يقبل هذه الشروط عن نفسه وعن جميع الأشخاص المقيمين معه.`,
    sejour: {
      titre: "1. الإقامة",
      logement: (l, a) => `المسكن: ${l}، ${a}.`,
      dates: (a, d) => `من ${a} إلى ${d}.`,
      datesInconnues: "في تواريخ الحجز.",
      voyageurs: (a, e) => `عدد البالغين: ${a}${e > 0 ? `، عدد الأطفال: ${e}` : ""}.`,
      agence: "تسلّم الوكالة المسكن نظيفًا وفي حالة جيدة، وتتكفل بإصلاح أي عطل لا يتسبب فيه المستأجر.",
    },
    paiement: {
      titre: "2. السعر والدفع",
      plateforme: (p) => `تم الحجز عبر ${p}: السعر والدفع وشروط الإلغاء هي المعمول بها لدى ${p}، وتُضاف إليها هذه الشروط.`,
      total: (m) => `السعر الإجمالي: ${m}.`,
      acompte: (m) => `العربون المدفوع: ${m}.`,
      solde: (m, d) => `الباقي: ${m}، يُدفع ${d ? `في أجل أقصاه ${d}` : "قبل الوصول"}. لا تُسلَّم المفاتيح إلا بعد الدفع الكامل.`,
      annulation: "في حال ألغى المستأجر الحجز، لا يُسترد العربون.",
      convenu: "السعر وطريقة الدفع هما ما تم الاتفاق عليه عند الحجز.",
    },
    occupants: {
      titre: "3. المقيمون",
      lignes: [
        "لا يُسمح بالإقامة في المسكن أو دخوله إلا للأشخاص المصرّح بهم في بطاقة الشرطة. ويجب أن توافق الوكالة مسبقًا وكتابيًا على أي زائر إضافي.",
      ],
    },
    regles: {
      titre: "4. قواعد المنزل",
      lignes: [
        "لا حفلات ولا مناسبات دون موافقة كتابية من الوكالة.",
        "لا حيوانات.",
        "ممنوع التدخين داخل المسكن.",
        "احترام الجيران والهدوء، خاصة ليلًا.",
        "احترام القانون المغربي والنظام العام.",
        "عدم تأجير المسكن من الباطن.",
      ],
    },
    securite: {
      titre: "5. السلامة",
      lignes: [
        "يبقى الأطفال تحت مراقبة شخص بالغ في جميع الأوقات، خاصة بالقرب من المسبح.",
        "يجب احترام تعليمات السلامة المعروضة في المسكن.",
      ],
    },
    degats: {
      titre: "6. الأضرار والضمان",
      responsabilite: "المستأجر مسؤول عن الأضرار التي يتسبب فيها هو أو مجموعته، ويُبلغ الوكالة بها فور حدوثها.",
      caution: (m) =>
        `يُطلب مبلغ ضمان قدره ${m} قبل الوصول (حجز على البطاقة البنكية أو إيداع)، ويُعاد بعد معاينة المغادرة مع خصم الأضرار المحتملة.`,
      procedurePlateforme: (p) => `تُسوّى الأضرار المحتملة وفق إجراءات ${p}.`,
      objets: "الوكالة غير مسؤولة عن الأغراض الشخصية المفقودة أو المسروقة، ولا عن انقطاع الماء أو الكهرباء أو الإنترنت الخارج عن إرادتها.",
    },
    manquement: {
      titre: "7. الإخلال الجسيم",
      ligne: "في حال الإخلال الجسيم بهذه الشروط (حفلة، أشخاص غير مصرّح بهم، سلوك مخالف للقانون)، يجوز للوكالة إنهاء الإقامة.",
    },
    droit: {
      titre: "8. القانون المطبق",
      ligne: "تخضع هذه الشروط للقانون المغربي، وتختص محاكم مراكش بالنظر في أي نزاع.",
    },
    mention: "ترجمة للعلم فقط، والنسخة الفرنسية هي المعتمدة.",
  },
};

const LIBELLE_PIECE: Record<ConditionsLang, string> = {
  fr: "pièce d'identité n°",
  en: "ID no.",
  es: "documento n.º",
  nl: "ID-nr.",
  ar: "وثيقة الهوية رقم",
};

function nomAvecPiece(d: ConditionsSejourData, lang: ConditionsLang): string | null {
  const nom = d.locataireNom?.trim() || null;
  const piece = d.locatairePiece?.trim();
  if (!nom) return null;
  return piece ? `${nom} (${LIBELLE_PIECE[lang]} ${piece})` : nom;
}

function champs(d: ConditionsSejourData, lang: ConditionsLang): Champs {
  const plateforme = plateformeDe(d.canal);
  return {
    nom: nomAvecPiece(d, lang),
    logement: d.logement,
    adresse: d.adresse,
    arrivee: formatDate(d.dateArrivee, lang),
    depart: formatDate(d.dateDepart, lang),
    adultes: d.nbAdultes && d.nbAdultes > 0 ? d.nbAdultes : null,
    enfants: d.nbEnfants && d.nbEnfants > 0 ? d.nbEnfants : 0,
    plateforme,
    // Pour une réservation plateforme, les montants ne sont jamais repris (ceux de la plateforme
    // font foi) — même s'ils sont connus dans l'app.
    total: plateforme ? null : formatMontant(d.montantTotal, d.devise, lang),
    acompte: plateforme || !montantPositif(d.acompteMontant) ? null : formatMontant(d.acompteMontant, d.devise, lang),
    solde: plateforme || !montantPositif(d.soldeMontant) ? null : formatMontant(d.soldeMontant, d.devise, lang),
    soldeDate: formatDate(d.soldeDateLimite, lang),
    caution: montantPositif(d.cautionMontant) ? formatMontant(d.cautionMontant, d.cautionDevise, lang) : null,
  };
}

export function construireConditions(d: ConditionsSejourData, lang: ConditionsLang = "fr"): ConditionsSejour {
  const t = TEXTES[lang] ?? TEXTES.fr;
  const c = champs(d, lang);

  const sejour = [
    t.sejour.logement(c.logement, c.adresse),
    c.arrivee && c.depart ? t.sejour.dates(c.arrivee, c.depart) : t.sejour.datesInconnues,
    ...(c.adultes ? [t.sejour.voyageurs(c.adultes, c.enfants ?? 0)] : []),
    t.sejour.agence,
  ];

  let paiement: string[];
  if (c.plateforme) {
    paiement = [t.paiement.plateforme(c.plateforme)];
  } else if (c.total) {
    paiement = [
      t.paiement.total(c.total),
      ...(c.acompte ? [t.paiement.acompte(c.acompte)] : []),
      ...(c.solde ? [t.paiement.solde(c.solde, c.soldeDate)] : []),
      ...(c.acompte ? [t.paiement.annulation] : []),
    ];
  } else {
    paiement = [t.paiement.convenu];
  }

  const degats = [
    t.degats.responsabilite,
    ...(c.caution ? [t.degats.caution(c.caution)] : c.plateforme ? [t.degats.procedurePlateforme(c.plateforme)] : []),
    t.degats.objets,
  ];

  return {
    titre: t.titre,
    intro: t.intro(c.nom),
    sections: [
      { titre: t.sejour.titre, lignes: sejour },
      { titre: t.paiement.titre, lignes: paiement },
      t.occupants,
      t.regles,
      t.securite,
      { titre: t.degats.titre, lignes: degats },
      { titre: t.manquement.titre, lignes: [t.manquement.ligne] },
      { titre: t.droit.titre, lignes: [t.droit.ligne] },
    ],
    mention: t.mention,
  };
}

// Textes de l'étape d'acceptation à la fin de la fiche police (/g/[id]).
export const ACCEPTATION_TEXTE: Record<
  ConditionsLang,
  { case: string; aide: string; erreurCase: string; erreurSignature: string }
> = {
  fr: {
    case: "J'ai lu et j'accepte les conditions de séjour, pour moi et pour mon groupe.",
    aide: "La signature de l'occupant 1 ci-dessus vaut signature de ces conditions.",
    erreurCase: "Merci d'accepter les conditions de séjour.",
    erreurSignature: "La signature de l'occupant 1 est obligatoire.",
  },
  en: {
    case: "I have read and accept the terms of stay, for myself and my group.",
    aide: "Occupant 1's signature above also signs these terms.",
    erreurCase: "Please accept the terms of stay.",
    erreurSignature: "Occupant 1's signature is required.",
  },
  es: {
    case: "He leído y acepto las condiciones de estancia, para mí y para mi grupo.",
    aide: "La firma del ocupante 1 de arriba vale como firma de estas condiciones.",
    erreurCase: "Acepte las condiciones de estancia.",
    erreurSignature: "La firma del ocupante 1 es obligatoria.",
  },
  nl: {
    case: "Ik heb de verblijfsvoorwaarden gelezen en aanvaard ze voor mezelf en mijn groep.",
    aide: "De handtekening van bewoner 1 hierboven geldt ook als ondertekening van deze voorwaarden.",
    erreurCase: "Aanvaard de verblijfsvoorwaarden.",
    erreurSignature: "De handtekening van bewoner 1 is verplicht.",
  },
  ar: {
    case: "قرأتُ شروط الإقامة وأوافق عليها، عن نفسي وعن مجموعتي.",
    aide: "توقيع المقيم 1 أعلاه يُعدّ توقيعًا على هذه الشروط.",
    erreurCase: "يرجى قبول شروط الإقامة.",
    erreurSignature: "توقيع المقيم 1 إلزامي.",
  },
};

// Écran « il ne reste que la signature » de /g/[id] : fiche police déjà remplie, conditions pas
// encore signées (fiches remplies avant la mise en ligne des conditions, 18/10/2026, ou étape
// ignorée). Les informations viennent de la pièce d'identité et de la réservation : le client ne
// saisit rien, il relit, coche et signe.
export const SIGNATURE_SEULE_TEXTE: Record<
  ConditionsLang,
  { titre: string; intro: string; signature: string; effacer: string; bouton: string; envoi: string; merci: string; erreurSignature: string }
> = {
  fr: {
    titre: "Dernière étape : signer les conditions de séjour",
    intro:
      "Votre fiche de police est déjà enregistrée, merci. Il ne reste qu'à lire et signer les conditions de séjour ci-dessous. Vos informations ont été reprises de votre pièce d'identité et de votre réservation.",
    signature: "Signature (avec le doigt ou la souris)",
    effacer: "Effacer",
    bouton: "Signer et envoyer",
    envoi: "Envoi...",
    merci: "Merci, les conditions de séjour ont bien été signées.",
    erreurSignature: "La signature est obligatoire.",
  },
  en: {
    titre: "Last step: sign the terms of stay",
    intro:
      "Your police form is already registered, thank you. You only need to read and sign the terms of stay below. Your details were taken from your ID document and your booking.",
    signature: "Signature (with your finger or mouse)",
    effacer: "Clear",
    bouton: "Sign and submit",
    envoi: "Sending...",
    merci: "Thank you, the terms of stay have been signed.",
    erreurSignature: "A signature is required.",
  },
  es: {
    titre: "Último paso: firmar las condiciones de estancia",
    intro:
      "Su ficha de policía ya está registrada, gracias. Solo falta leer y firmar las condiciones de estancia. Sus datos se han tomado de su documento de identidad y de su reserva.",
    signature: "Firma (con el dedo o el ratón)",
    effacer: "Borrar",
    bouton: "Firmar y enviar",
    envoi: "Enviando...",
    merci: "Gracias, las condiciones de estancia han sido firmadas.",
    erreurSignature: "La firma es obligatoria.",
  },
  nl: {
    titre: "Laatste stap: onderteken de verblijfsvoorwaarden",
    intro:
      "Uw politieformulier is al geregistreerd, dank u. U hoeft alleen nog de verblijfsvoorwaarden hieronder te lezen en te ondertekenen. Uw gegevens zijn overgenomen van uw identiteitsbewijs en uw reservering.",
    signature: "Handtekening (met uw vinger of muis)",
    effacer: "Wissen",
    bouton: "Ondertekenen en verzenden",
    envoi: "Verzenden...",
    merci: "Dank u, de verblijfsvoorwaarden zijn ondertekend.",
    erreurSignature: "Een handtekening is verplicht.",
  },
  ar: {
    titre: "الخطوة الأخيرة: توقيع شروط الإقامة",
    intro:
      "تم تسجيل بطاقة الشرطة الخاصة بك، شكرًا. يبقى فقط قراءة شروط الإقامة أدناه والتوقيع عليها. تم أخذ بياناتك من وثيقة هويتك ومن حجزك.",
    signature: "التوقيع (بالإصبع أو بالفأرة)",
    effacer: "مسح",
    bouton: "وقّع وأرسل",
    envoi: "جارٍ الإرسال...",
    merci: "شكرًا، تم توقيع شروط الإقامة.",
    erreurSignature: "التوقيع إلزامي.",
  },
};

export function langueConditions(langue: string | null | undefined): ConditionsLang {
  return langue === "fr" || langue === "en" || langue === "es" || langue === "nl" || langue === "ar" ? langue : "fr";
}
