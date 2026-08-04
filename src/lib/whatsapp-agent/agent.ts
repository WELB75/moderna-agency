import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { VILLAS } from "./villas";
import { buildConfirmationEmailHtml, sendConfirmationEmail } from "./email";
import { initiateCuisineRequest, initiateMenageRequest, dayAfter } from "./staff";

const client = new Anthropic();

const villasPromptList = VILLAS.map((v) => `${v.nom} (${v.blurb}) — caution ${v.caution}€, frais de ménage ${v.menage}€`).join("\n- ");

const tools: Tool[] = [
  {
    name: "check_availability",
    description: "Vérifie si une villa est libre sur une plage de dates données, en consultant le vrai calendrier de réservations.",
    input_schema: {
      type: "object",
      properties: {
        villa: { type: "string", description: "Nom exact de la villa (tel que dans la liste fournie)" },
        dateArrivee: { type: "string", description: "Date d'arrivée YYYY-MM-DD" },
        dateDepart: { type: "string", description: "Date de départ YYYY-MM-DD" },
      },
      required: ["villa", "dateArrivee", "dateDepart"],
    },
  },
  {
    name: "create_booking",
    description: "Crée la réservation une fois que le client a confirmé et que la disponibilité a été vérifiée. NE PAS appeler avant confirmation explicite du client. Ne jamais demander le prix au client : il est calculé automatiquement.",
    input_schema: {
      type: "object",
      properties: {
        villa: { type: "string" },
        dateArrivee: { type: "string" },
        dateDepart: { type: "string" },
        prenom: { type: "string" },
        nom: { type: "string" },
        email: { type: "string" },
        telephone: { type: "string" },
        pays: { type: "string" },
        nombreAdultes: { type: "number" },
        nombreEnfants: { type: "number" },
        cuisiniere: { type: "string", description: "'non' si pas de cuisinière, sinon quels repas : ex. 'petit-déjeuner' ou 'petit-déjeuner + déjeuner'" },
        litBebe: { type: "boolean", description: "true si un lit bébé est demandé" },
        demandesSpecifiques: { type: "string", description: "Toute autre demande particulière du client, texte libre" },
      },
      required: ["villa", "dateArrivee", "dateDepart", "prenom", "nom", "email", "telephone", "pays", "nombreAdultes"],
    },
  },
];

// Un client peut donner une date absolue déjà passée (ex. "janvier 2026" alors qu'on est en août
// 2026) sans que ce soit une expression relative que le modèle sait naturellement faire glisser à
// l'année suivante ("21 juillet" → l'an prochain si déjà passé). Filet de sécurité déterministe :
// on ne fait confiance ni à Claude ni au client sur ce point, on vérifie nous-mêmes.
function pastDateError(dateArrivee: string): { erreur: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  if (dateArrivee < today) {
    return { erreur: `La date d'arrivée (${dateArrivee}) est déjà passée (nous sommes le ${today}) — demande au client de confirmer l'année ou la date exacte souhaitée, ne suppose rien.` };
  }
  return null;
}

async function checkAvailability(villaNom: string, dateArrivee: string, dateDepart: string) {
  const villa = VILLAS.find((v) => v.nom.toLowerCase() === villaNom.toLowerCase());
  if (!villa) return { erreur: `Villa "${villaNom}" non reconnue dans la liste.` };
  const pastError = pastDateError(dateArrivee);
  if (pastError) return pastError;
  const db = getDb();
  const rows = await db
    .select({ guestName: reservations.guestName, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villa.id),
        ne(reservations.status, "annulee"),
        lt(reservations.checkIn, new Date(dateDepart)),
        gt(reservations.checkOut, new Date(dateArrivee))
      )
    )
    .orderBy(reservations.checkIn);
  if (rows.length === 0) return { disponible: true };
  return {
    disponible: false,
    conflits: rows.map((r) => ({
      guest_name: r.guestName,
      check_in: r.checkIn.toISOString().slice(0, 10),
      check_out: r.checkOut.toISOString().slice(0, 10),
    })),
  };
}

function nights(dateArrivee: string, dateDepart: string) {
  const ms = new Date(dateDepart).getTime() - new Date(dateArrivee).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

// Superhote a renvoyé "The selected country is invalid" pour "France" — les erreurs Laravel de
// ce type ("selected X invalid") viennent presque toujours d'une validation par liste fermée
// (codes ISO), pas le nom complet. Mapping minimal, à étendre si besoin.
const COUNTRY_ISO: Record<string, string> = {
  france: "FR",
  maroc: "MA",
  "royaume-uni": "GB",
  "royaume uni": "GB",
  angleterre: "GB",
  belgique: "BE",
  suisse: "CH",
  espagne: "ES",
  "etats-unis": "US",
  "états-unis": "US",
  usa: "US",
  allemagne: "DE",
  italie: "IT",
  canada: "CA",
};
function toCountryCode(pays: unknown): string {
  const key = String(pays ?? "").trim().toLowerCase();
  return COUNTRY_ISO[key] ?? String(pays ?? "");
}

// Indicatifs pour reconstruire un numéro international (+33, +212...) à partir d'un numéro local
// si le client ne le donne pas déjà au format international.
const DIAL_CODES: Record<string, string> = {
  FR: "33", MA: "212", GB: "44", BE: "32", CH: "41", ES: "34", US: "1", DE: "49", IT: "39", CA: "1",
};
function toInternationalPhone(telephone: unknown, countryIso: string): { value: string; valid: boolean } {
  const raw = String(telephone ?? "").replace(/[\s.\-()]/g, "");
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return { value: `+${digits}`, valid: digits.length >= 8 };
  }
  const dial = DIAL_CODES[countryIso];
  const local = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!dial || local.length < 8) return { value: raw, valid: false };
  return { value: `+${dial}${local}`, valid: true };
}

async function createBooking(input: Record<string, unknown>) {
  const pastError = pastDateError(String(input.dateArrivee));
  if (pastError) return pastError;

  const villa = VILLAS.find((v) => v.nom.toLowerCase() === String(input.villa).toLowerCase());
  const n = nights(String(input.dateArrivee), String(input.dateDepart));
  const prixNuit = villa?.prixNuit ?? 0;
  const countryIso = toCountryCode(input.pays);
  const phone = toInternationalPhone(input.telephone, countryIso);

  if (!phone.valid) {
    return { erreur: `Le numéro de téléphone ("${input.telephone}") ne semble pas valide pour le pays donné — redemande-le au client au format international complet (ex. +33 6 51 21 12 76), rien n'a été envoyé.` };
  }
  if (!villa) return { erreur: `Villa "${input.villa}" non reconnue, impossible de créer la réservation.` };

  // Regroupées en notes texte, comme le vrai formulaire Superhote (champ "notes" observé dans
  // extra_data_from_form sur une résa réelle) — pour que l'équipe voie direct les demandes du
  // client sans devoir relire toute la conversation WhatsApp.
  const notesParts: string[] = [];
  const cuisiniere = String(input.cuisiniere ?? "").trim();
  if (cuisiniere && cuisiniere.toLowerCase() !== "non") notesParts.push(`Cuisinière souhaitée : ${cuisiniere}`);
  if (input.litBebe) notesParts.push("Lit bébé demandé");
  const demandes = String(input.demandesSpecifiques ?? "").trim();
  if (demandes) notesParts.push(`Demande spécifique : ${demandes}`);
  const notes = notesParts.join(" | ");

  const guestName = `${input.prenom ?? ""} ${input.nom ?? ""}`.trim();
  const guestsCount = Number(input.nombreAdultes ?? 0) + Number(input.nombreEnfants ?? 0);
  const total = prixNuit * n;

  // 1) Action principale et fiable : écrit la réservation directement dans la vraie base
  // Moderna Agency (même mécanisme que le bouton "Ajouter réservation" manuel) — visible
  // immédiatement dans l'appli (Dashboard, Villas...). source="whatsapp-ia" pour la distinguer
  // des résas Superhote/manuelles.
  const db = getDb();
  let modernaBookingId: string | null = null;
  try {
    const [row] = await db
      .insert(reservations)
      .values({
        villaId: villa.id,
        guestName,
        guestPhone: phone.value,
        guestEmail: String(input.email ?? ""),
        checkIn: new Date(String(input.dateArrivee)),
        checkOut: new Date(String(input.dateDepart)),
        guestsCount,
        nbAdultes: Number(input.nombreAdultes ?? 0),
        nbEnfants: Number(input.nombreEnfants ?? 0),
        status: "confirmee",
        source: "whatsapp-ia",
        canal: "Direct",
        notes: notes || null,
        loyerTotal: String(total),
        devisePaiement: "EUR",
      })
      .returning({ id: reservations.id });
    modernaBookingId = row?.id ?? null;
  } catch (err) {
    console.error("Échec de l'écriture dans Moderna Agency:", err);
    return { erreur: "Un souci technique est survenu, la réservation n'a pas pu être enregistrée." };
  }

  // 1bis) Si une cuisinière est demandée, déclenche la recherche automatique d'une candidate
  // disponible (agent séparé, en arabe) — indépendant de l'email/Superhote ci-dessous, ne doit
  // jamais faire échouer la réservation elle-même si ça plante.
  if (cuisiniere && cuisiniere.toLowerCase() !== "non" && modernaBookingId) {
    try {
      const avecDejeuner = /d[ée]jeuner/.test(cuisiniere.toLowerCase().replace("petit-déjeuner", "").replace("petit déjeuner", ""));
      await initiateCuisineRequest(modernaBookingId, {
        villaNom: villa.nom,
        dateArrivee: dayAfter(String(input.dateArrivee)),
        dateDepart: String(input.dateDepart),
        avecDejeuner,
      });
    } catch (err) {
      console.error("Échec initiation demande cuisine:", err);
    }
  }

  // 1ter) Le ménage de fin de séjour concerne TOUTE réservation (contrairement à la cuisine,
  // optionnelle) — déclenché systématiquement, jamais bloquant pour la réservation elle-même.
  if (modernaBookingId) {
    try {
      await initiateMenageRequest(modernaBookingId, villa.nom, String(input.dateDepart));
    } catch (err) {
      console.error("Échec initiation demande ménage:", err);
    }
  }

  const bookingRef = modernaBookingId ? modernaBookingId.slice(0, 8).toUpperCase() : "N/A";
  await sendConfirmationEmail(
    String(input.email ?? ""),
    `Réservation confirmée — ${villa.nom}, ${new Date(String(input.dateArrivee)).toLocaleDateString("fr-FR")}`,
    buildConfirmationEmailHtml({
      prenom: String(input.prenom ?? ""),
      villaNom: villa.nom,
      villaBlurb: villa.blurb,
      dateArrivee: String(input.dateArrivee),
      dateDepart: String(input.dateDepart),
      nights: n,
      total,
      guestsCount,
      notes,
      bookingRef,
    })
  );

  // 2) Superhote : plus de tentative d'écriture directe via create-booking. Leur support a
  // confirmé (2026-08-03) que cet endpoint est en réalité le moteur de paiement de leur site de
  // réservation directe — il exige un card_token Stripe valide, un compte Stripe connecté sur le
  // logement, et un tarif incluant exactement leurs frais de ménage/taxes de séjour. Sans un vrai
  // tunnel de paiement, il ne peut structurellement jamais aboutir (500 générique sur dates
  // lointaines libres, faute de gestion d'erreur de leur côté). La solution retenue à la place :
  // un export iCal des réservations WhatsApp (voir /api/ical/export/[villaId]) que Superhote peut
  // importer comme calendrier de blocage, pour éviter les doubles réservations sans passer par
  // Stripe. Voir la mémoire du projet pour le détail de leur réponse.

  return { success: true, modernaBookingId, bookingRef, totalPrice: total, nights: n };
}

function buildSystemPrompt(today: string) {
  return `Tu es l'agent WhatsApp de Moderna Agency, une conciergerie de villas à Marrakech. Tu réponds directement aux clients qui contactent l'agence pour réserver, sur un ton chaleureux mais bref (style WhatsApp, pas de pavés).

La date d'aujourd'hui est ${today}.

Logements gérés par l'agence (villas, et appartements — ceux dont le nom finit par "cosy") :
- ${villasPromptList}

Règles :
- Réponds TOUJOURS dans la langue utilisée par le client (français, anglais, arabe, espagnol...). Change de langue en cours de conversation si le client change. Si son premier message est ambigu (ex. juste "Bonjour"), réponds dans cette langue par défaut, sinon adapte-toi dès que sa langue est claire.
- Si l'occasion se présente naturellement (pas besoin de le dire systématiquement dès le premier message), précise que tu préfères que le client écrive plutôt qu'il envoie un vocal, pour garder une trace claire de la conversation — mais rassure-le : les messages vocaux sont aussi compris sans problème, dans n'importe quelle langue, ce n'est jamais bloquant.
- Identifie la villa demandée (corrige fautes d'orthographe/surnoms, reconnais une description d'équipements).
- Aucun logement de l'agence n'a de vis-à-vis (aucune vue directe depuis un logement voisin) — si un client pose la question sur l'intimité/le vis-à-vis, réponds-lui avec assurance qu'aucune villa n'en a.
- Toutes les piscines de l'agence sont chauffées (pas une option payante, c'est inclus).
- Infos à collecter avant de pouvoir réserver : villa, dates d'arrivée/départ, nombre d'adultes et d'enfants, prénom, nom, email, téléphone, pays. Demande-les une à la fois ou groupées naturellement, ne les invente jamais.
- Une fois ces infos obligatoires réunies (avant la confirmation finale), pose aussi ces questions complémentaires — utiles à l'équipe mais PAS bloquantes, si le client ne répond pas ou dit "non merci" tu continues normalement : besoin d'une cuisinière (et si oui, quels repas : petit-déjeuner seul, ou petit-déjeuner + déjeuner) ; besoin d'un lit bébé ; toute autre demande spécifique. Ne pose pas ces questions une par une façon interrogatoire — groupe-les naturellement en une ou deux questions.
- Tarifs cuisinière (à communiquer au client s'il en demande une) : 200 MAD/jour pour le petit-déjeuner seul, 300 MAD/jour pour petit-déjeuner + déjeuner. C'est un coût en plus du loyer de la villa, en dirhams (pas en euros) — précise-le clairement au client pour qu'il sache à quoi s'attendre avant de confirmer.
- Villa Sofya uniquement : une femme de ménage est incluse dans le prix de la villa (contrairement aux autres logements où le ménage de fin de séjour est facturé à part) — la cuisinière, elle, reste en supplément comme partout ailleurs, aux mêmes tarifs.
- Le téléphone doit TOUJOURS inclure l'indicatif pays (+33, +212, +44...), même si le client donne un numéro différent de celui utilisé sur WhatsApp. Demande-le explicitement sous cette forme ("votre numéro avec l'indicatif du pays, ex. +33 6 51 21 12 76") ; si le client répond sans indicatif, redemande-le au lieu de deviner.
- Les dates données par le client doivent être cohérentes avec aujourd'hui (${today}) : si une date semble déjà passée (ex. un mois/année manifestement révolu), ne suppose jamais qu'il s'agit d'une erreur d'année à corriger toi-même — demande au client de confirmer la date exacte souhaitée.
- Ne jamais demander le prix au client ni en parler avant la confirmation finale — le prix est calculé automatiquement par l'agence à partir du tarif de la villa. Une fois la réservation créée, tu peux annoncer le prix total au client (donné par l'outil).
- Utilise l'outil check_availability dès que tu as villa + dates, avant de continuer à collecter le reste.
- Si la villa n'est pas disponible, préviens le client et propose-lui une autre villa si pertinent (seulement si tu as une bonne raison de penser qu'elle correspond).
- Juste avant de demander la confirmation finale, redemande une dernière fois s'il y a autre chose de spécifique à noter (même si déjà abordé plus tôt dans la conversation) — pour être sûr de ne rien manquer avant de créer la réservation.
- N'utilise create_booking qu'une fois TOUTES les infos obtenues ET une confirmation explicite du client ("oui", "c'est bon", "je confirme"...).
- Une fois la réservation créée, confirme au client avec les dates, la villa, le prix total, **et rappelle le montant de la caution et des frais de ménage de cette villa** (indiqués dans la liste des logements ci-dessus) — précise que la caution est remboursable et sera à régler séparément avant l'arrivée. Précise aussi que l'agence le recontactera pour lui envoyer le contrat de location et la fiche de police (sécurité).
- L'historique de cette conversation peut couvrir plusieurs jours, semaines ou mois — un message annoté "[Reprise après une pause de ...]" signale une reprise après une longue interruption. Dans ce cas, revérifie les informations discutées avant la pause (disponibilité, dates) avant de t'appuyer dessus : la situation a pu changer entre-temps.`;
}

// Un historique persisté ne doit jamais se terminer par un tool_use non résolu (Claude rejette
// alors TOUT appel futur avec ce même historique, ce qui bloque la conversation en boucle) — ça
// arrive si un appel précédent a été interrompu (timeout Vercel, crash réseau) juste après avoir
// reçu des tool_use mais avant que le tour ne soit sauvegardé dans un état cohérent. On répare en
// coupant tout ce qui suit le dernier message assistant bien formé (texte, sans tool_use).
export function repairMessageHistory(messages: MessageParam[]): MessageParam[] {
  let lastValidEnd = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use")) {
      lastValidEnd = i;
    } else {
      break;
    }
  }
  return messages.slice(0, lastValidEnd);
}

export async function runAgentTurn(messages: MessageParam[], onRoundComplete?: (messages: MessageParam[]) => Promise<void>): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSystemPrompt(today), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    }

    // Chaque bloc doit produire un tool_result, y compris en cas d'échec de l'outil lui-même —
    // sinon un seul appel qui plante (ex. hoquet réseau/DB) laisserait le lot incomplet et le
    // message assistant précédent (déjà poussé ci-dessus) resterait un tool_use sans réponse.
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        if (block.name === "check_availability") {
          const input = block.input as { villa: string; dateArrivee: string; dateDepart: string };
          result = await checkAvailability(input.villa, input.dateArrivee, input.dateDepart);
        } else if (block.name === "create_booking") {
          result = await createBooking(block.input as Record<string, unknown>);
        } else {
          result = { erreur: "Outil inconnu" };
        }
      } catch (err) {
        console.error(`Échec outil ${block.name}:`, err);
        result = { erreur: "Un souci technique est survenu pendant cette vérification." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });

    // Persiste dès que l'historique est de nouveau dans un état valide (tool_use tous résolus),
    // pour qu'une interruption plus tard dans une conversation à plusieurs tours n'efface pas la
    // progression déjà faite ni ne laisse un historique corrompu en base.
    if (onRoundComplete) await onRoundComplete(messages);
  }
}
