import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { differenceInCalendarDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { VILLAS } from "@/lib/whatsapp-agent/villas";

// Agent IA de la boîte de réception Airbnb / Booking.com — Kamel, 2026-10-17 : "est-ce qu'on peut
// l'intégrer à Booking et Airbnb ? Que ça réponde automatiquement avec l'agent IA". Première
// étape validée : l'agent PRÉPARE un brouillon (jamais d'envoi tout seul), l'équipe relit et
// envoie d'un clic. Le brouillon est écrit en français : la case "Écris en français" de la boîte
// de réception le traduit dans la langue du voyageur à l'envoi.
//
// Le contexte (codes, wifi...) est construit côté serveur pour la SEULE réservation du fil, jamais
// le catalogue entier : un voyageur ne doit pas pouvoir faire sortir les codes d'une autre villa.

const client = new Anthropic();

// Tarifs cuisinière communiqués au voyageur (identiques à l'agent WhatsApp de réservation, voir
// whatsapp-agent/agent.ts) : en dirhams, en plus du loyer.
const CUISINIERE_PETIT_DEJ_MAD = 200;
const CUISINIERE_PETIT_DEJ_DEJEUNER_MAD = 300;
const CARTE_REPAS_URL = "https://loyak6makvlkxqye.public.blob.vercel-storage.com/welcome/carte-repas-moderna-agency.png";

// Les codes d'accès ne sont communicables qu'à partir de la veille de l'arrivée (jusqu'au départ),
// et jamais pour une simple demande d'information ou une réservation annulée.
const CODES_JOURS_AVANT_ARRIVEE = 1;

export type ContexteLogement = {
  nom: string;
  numero: string;
  type: "villa" | "appartement";
  description: string | null;
  adresse: string | null;
  domaineNom: string | null;
  mapsUrl: string | null;
  wazeUrl: string | null;
  codeBoitier: string | null;
  codePorteEntree: string | null;
  codeWifi: string | null;
  guideBienvenueUrl: string | null;
  repasInclusDansLoyer: boolean;
};

export type ContexteSejour = {
  // null pour une demande d'information (pas encore de réservation).
  reservation: { guestName: string; checkIn: Date; checkOut: Date; canal: string | null; annulee: boolean; nbVoyageurs: number | null } | null;
  logement: ContexteLogement | null;
};

export type FilMessage = { deVoyageur: boolean; texte: string };

export type SuggestionReponse = {
  reponseFr: string;
  besoinHumain: boolean;
  raison: string;
};

function renseigne(v: string | null | undefined): v is string {
  return Boolean(v && v.trim());
}

function bloquAccess(sejour: ContexteSejour, maintenant: Date): { codesAutorises: boolean; motif: string } {
  const r = sejour.reservation;
  if (!r) return { codesAutorises: false, motif: "ce n'est qu'une demande d'information, pas une réservation confirmée" };
  if (r.annulee) return { codesAutorises: false, motif: "la réservation est annulée" };
  if (r.checkOut < maintenant) return { codesAutorises: false, motif: "le séjour est terminé" };
  const joursAvant = differenceInCalendarDays(r.checkIn, maintenant);
  if (joursAvant > CODES_JOURS_AVANT_ARRIVEE) {
    return { codesAutorises: false, motif: `ils ne sont communiqués que la veille de l'arrivée (arrivée dans ${joursAvant} jours)` };
  }
  return { codesAutorises: true, motif: "" };
}

// Caution (Kamel, 2026-10-20) : 1000 € sur toutes les villas, 250 € sur les appartements sauf Amal
// et Jade à 500 € ; empreinte bancaire demandée uniquement aux réservations Booking.com / Direct.
function cautionEur(l: ContexteLogement): number {
  if (l.type === "villa") return 1000;
  return /^(amal|jade)\b/i.test(l.nom) ? 500 : 250;
}

function blocLogement(sejour: ContexteSejour, maintenant: Date): string {
  const l = sejour.logement;
  if (!l) return "Logement : non relié à une fiche de l'agence — ne donne aucune information propre au logement, passe la main à l'équipe.";

  const { codesAutorises, motif } = bloquAccess(sejour, maintenant);
  const lignes: string[] = [`Logement : ${l.nom}${l.numero ? ` (n°${l.numero})` : ""} — ${l.type === "villa" ? "villa" : "appartement"}`];
  if (renseigne(l.domaineNom)) lignes.push(`Domaine / résidence : ${l.domaineNom}`);
  if (renseigne(l.adresse)) lignes.push(`Adresse : ${l.adresse}`);
  if (renseigne(l.mapsUrl)) lignes.push(`Google Maps : ${l.mapsUrl}`);
  if (renseigne(l.wazeUrl)) lignes.push(`Waze : ${l.wazeUrl}`);
  if (renseigne(l.guideBienvenueUrl)) lignes.push(`Guide de bienvenue : ${l.guideBienvenueUrl}`);
  if (renseigne(l.description)) lignes.push(`Description : ${l.description.replace(/\s+/g, " ").trim()}`);

  if (codesAutorises) {
    lignes.push("Accès et wifi (communicables à ce voyageur) :");
    lignes.push(renseigne(l.codeBoitier) ? `- Boîtier à clés : ${l.codeBoitier}` : "- Boîtier à clés : non renseigné");
    if (renseigne(l.codePorteEntree)) lignes.push(`- Porte d'entrée (serrure tactile / digicode) : ${l.codePorteEntree}`);
    lignes.push(renseigne(l.codeWifi) ? `- Code wifi : ${l.codeWifi}` : "- Code wifi : non renseigné");
  } else {
    lignes.push(
      `Codes d'accès et wifi : NE PAS LES COMMUNIQUER (${motif}). Si le voyageur les demande, dis-lui poliment qu'ils lui seront envoyés la veille de son arrivée.`
    );
  }

  const caution = sejour.reservation?.canal?.toLowerCase().includes("airbnb")
    ? "Caution : aucune sur les réservations Airbnb — n'en parle pas."
    : `Caution : empreinte bancaire de ${cautionEur(l)} € (aucun débit, levée après le départ), lien envoyé automatiquement avant l'arrivée.`;
  lignes.push(caution);
  // Frais de ménage facturés au voyageur (EUR, forfait par logement) : 60 € petites villas, 80 €
  // grandes villas à étage, 20 € appartements. Ce que l'agence verse aux femmes de ménage n'a
  // rien à voir et ne se communique pas.
  const menage = VILLAS.find((v) => v.nom.toLowerCase() === l.nom.toLowerCase())?.menage;
  lignes.push(
    menage
      ? `Ménage de fin de séjour : frais de ${menage} € en supplément, forfait pour le logement. Ne parle jamais du nombre de femmes de ménage ni de leur rémunération.`
      : "Ménage de fin de séjour : montant non renseigné pour ce logement, passe la main à l'équipe s'il est demandé."
  );

  // Cuisinière : seulement sur les villas. Comprise dans le loyer pour certaines (ex. Sofya,
  // Wimiliim) ; dans les deux cas le voyageur règle les courses et le coursier.
  if (l.type !== "villa") {
    lignes.push("Cuisinière : service proposé uniquement sur les villas, pas sur cet appartement — ne la propose pas.");
  } else if (l.repasInclusDansLoyer) {
    lignes.push(
      `Cuisinière : INCLUSE dans le prix de la villa, aucun supplément pour ses services (carte des repas : ${CARTE_REPAS_URL}). ` +
        "Le voyageur règle seulement les courses et le coursier. Précise-le à chaque fois qu'il parle d'une cuisinière."
    );
  } else {
    lignes.push(
      `Cuisinière (en supplément, en dirhams) : ${CUISINIERE_PETIT_DEJ_MAD} MAD/jour pour le petit-déjeuner seul, ${CUISINIERE_PETIT_DEJ_DEJEUNER_MAD} MAD/jour pour petit-déjeuner + déjeuner (carte des repas : ${CARTE_REPAS_URL}). ` +
        "Les courses (produits) et le coursier qui les apporte sont à la charge du voyageur, en plus. Précise-le à chaque fois qu'il parle d'une cuisinière."
    );
  }
  return lignes.join("\n");
}

const SuggestionSchema = z.object({
  reponse_fr: z.string().describe("Réponse prête à envoyer au voyageur, EN FRANÇAIS (elle sera traduite à l'envoi). Chaîne vide si besoin_humain et rien de sûr à dire."),
  besoin_humain: z.boolean().describe("true si un humain doit traiter ce message (sujet sensible ou information manquante)."),
  raison: z.string().describe("Une phrase pour l'équipe : pourquoi un humain doit intervenir, ou sur quelles infos la réponse s'appuie."),
});

export async function suggererReponse(sejour: ContexteSejour, fil: FilMessage[], maintenant = new Date()): Promise<SuggestionReponse> {
  const r = sejour.reservation;
  const sejourTexte = r
    ? `Réservation ${r.annulee ? "ANNULÉE" : "confirmée"} — ${r.guestName}, du ${format(r.checkIn, "d MMMM yyyy", { locale: fr })} au ${format(r.checkOut, "d MMMM yyyy", { locale: fr })}` +
      `${r.nbVoyageurs ? `, ${r.nbVoyageurs} voyageur(s)` : ""}${r.canal ? `, via ${r.canal}` : ""}.`
    : "Demande d'information : le voyageur n'a PAS encore réservé.";

  const conversation = fil
    .slice(-20)
    .map((m) => `${m.deVoyageur ? "Voyageur" : "Moderna Agency"} : ${m.texte}`)
    .join("\n\n");

  const message = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 1500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(SuggestionSchema) },
    system: `Tu rédiges des brouillons de réponse pour l'équipe de Moderna Agency, conciergerie de locations de vacances à Marrakech, à des voyageurs qui écrivent via Airbnb ou Booking.com. L'équipe relit chaque brouillon avant de l'envoyer.

Date et heure : ${format(maintenant, "EEEE d MMMM yyyy", { locale: fr })}.

${sejourTexte}

${blocLogement(sejour, maintenant)}

Infos générales : arrivée à partir de 15h, départ avant 11h. La piscine chauffée est une option payante : 30 € par jour (en euros), à demander avant l'arrivée. Aucun logement n'a de vis-à-vis.

Règles :
- Écris en français, quelle que soit la langue du voyageur (la traduction est faite à l'envoi). Ton chaleureux, poli, bref, style message de plateforme — pas de pavé, pas d'émojis.
- Ne réponds qu'avec les informations ci-dessus. N'invente jamais un code, un prix, un horaire, un équipement ou une règle. Si l'information manque, mets besoin_humain à true et dis-le dans raison.
- Ne communique jamais de code d'accès ou de wifi si le bloc logement dit de ne pas le faire. Ne cite aucun autre logement que celui de ce séjour.
- Ne propose jamais de payer, réserver ou négocier en dehors de la plateforme, et ne donne pas de prix de séjour : renvoie vers la réservation sur la plateforme.
- Mets besoin_humain à true (et propose au mieux un court accusé de réception) pour : remboursement, litige ou plainte, dégât, annulation ou changement de dates, arrivée anticipée ou départ tardif (tu ne peux rien promettre), demande d'argent ou de paiement, problème de sécurité ou médical, tarif ou remise, et toute question dont la réponse n'est pas dans les informations ci-dessus.
- Si le dernier message du voyageur est un simple remerciement ou un accusé de réception qui n'appelle pas de réponse, mets reponse_fr à une chaîne vide, besoin_humain à false et explique-le dans raison.
- Signe "L'équipe Moderna Agency" seulement si la réponse est longue ; sinon pas de signature.`,
    messages: [{ role: "user", content: `Voici la conversation (du plus ancien au plus récent). Rédige le brouillon de réponse au dernier message du voyageur.\n\n${conversation}` }],
  });

  const out = message.parsed_output;
  if (!out) throw new Error("Suggestion indisponible.");
  return { reponseFr: out.reponse_fr.trim(), besoinHumain: out.besoin_humain, raison: out.raison.trim() };
}
