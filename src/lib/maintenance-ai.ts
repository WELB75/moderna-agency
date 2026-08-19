import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { put } from "@vercel/blob";
import { eq, and, or, desc } from "drizzle-orm";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { interventions, technicians, villas, maintenanceConversations } from "@/db/schema";
import { loadImageBuffer } from "@/lib/fetch-image-buffer";
import { getBaseUrl } from "@/lib/base-url";
import { categorieLabel } from "@/lib/intervention-categorie";
import { sendWhatsAppText, sendWhatsAppTextAndVoice } from "@/lib/whatsapp-agent/send";
import { textToSpeech } from "@/lib/whatsapp-agent/elevenlabs";
import { repairMessageHistory } from "@/lib/whatsapp-agent/agent";

// Même numéro que staff.ts (OBSERVER_PHONE) : Kamel reçoit un compte-rendu à chaque étape clé de
// l'agent maintenance, et c'est vers lui que l'agent redirige dès que la conversation dérive sur
// l'argent/un devis — jamais négocié par l'IA elle-même. Kamel, 2026-08-18.
const KAMEL_PHONE = "+33672516297";

const client = new Anthropic();

function mimeTypeToClaudeMedia(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

const MatchSchema = z.object({
  technicien_nom: z.string().describe("Nom exact d'un technicien de la liste fournie, ou chaîne vide si aucun ne correspond."),
  confiance: z.enum(["haute", "moyenne", "basse"]).describe("Confiance dans ce choix."),
  raison: z.string().describe("Courte justification en français."),
});

export type MatchResult = {
  technicianId: string;
  technicianNom: string;
  confiance: "haute" | "moyenne" | "basse";
  raison: string;
} | null;

// Lit le problème signalé (texte + éventuelle photo) et choisit le technicien le plus pertinent
// du répertoire, selon sa fonction — Kamel, 2026-08-18 : "elle va detecter quel technicien
// contacter, donc par exemple souci avec des stores elle contactera Issam (technicien store)".
// Ne devine jamais au hasard : confiance basse ou aucun candidat plausible → pas de sélection.
export async function matchTechnicianForIntervention(interventionId: string): Promise<MatchResult> {
  const db = getDb();

  const [intervention] = await db
    .select({
      titre: interventions.titre,
      probleme: interventions.probleme,
      categorie: interventions.categorie,
      attachmentUrls: interventions.attachmentUrls,
    })
    .from(interventions)
    .where(eq(interventions.id, interventionId))
    .limit(1);
  if (!intervention) return null;

  const allTechnicians = await db.select({ id: technicians.id, nom: technicians.nom, fonction: technicians.fonction }).from(technicians);
  if (allTechnicians.length === 0) return null;

  const photoUrl = intervention.attachmentUrls?.[0];
  let imageContent: { type: "image"; source: { type: "base64"; media_type: ReturnType<typeof mimeTypeToClaudeMedia>; data: string } } | null = null;
  if (photoUrl) {
    const buffer = await loadImageBuffer(photoUrl).catch(() => null);
    if (buffer) {
      imageContent = {
        type: "image",
        source: { type: "base64", media_type: mimeTypeToClaudeMedia(guessMimeType(photoUrl)), data: buffer.toString("base64") },
      };
    }
  }

  const listeTechniciens = allTechnicians.map((t) => `- ${t.nom} : ${t.fonction}`).join("\n");
  const description = [
    `Titre : ${intervention.titre}`,
    intervention.probleme ? `Problème décrit : ${intervention.probleme}` : null,
    `Catégorie : ${categorieLabel(intervention.categorie)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 300,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
    system:
      "Tu choisis, parmi une liste de techniciens et leur fonction/spécialité, celui qui est le plus adapté " +
      "pour traiter un problème de maintenance décrit ci-dessous (texte, et une photo si fournie). Ne choisis " +
      "un technicien que si sa fonction correspond clairement au problème — sinon renvoie technicien_nom vide " +
      "plutôt que de deviner au hasard.",
    messages: [
      {
        role: "user",
        content: [
          ...(imageContent ? [imageContent] : []),
          { type: "text", text: `${description}\n\nTechniciens disponibles :\n${listeTechniciens}` },
        ],
      },
    ],
  });

  const result = message.parsed_output;
  if (!result || !result.technicien_nom.trim()) return null;

  const matched = allTechnicians.find((t) => t.nom.trim().toLowerCase() === result.technicien_nom.trim().toLowerCase());
  if (!matched) return null;

  return { technicianId: matched.id, technicianNom: matched.nom, confiance: result.confiance, raison: result.raison };
}

export async function notifyKamelMaintenance(message: string): Promise<void> {
  await sendWhatsAppText(KAMEL_PHONE, message);
}

function villaLabel(nom: string | null, numero: string | null): string {
  if (!nom) return "domaine";
  return numero ? `${nom} (n°${numero})` : nom;
}

// Même page publique que /i/[id] (voir src/app/i/[id]/page.tsx), déjà utilisée pour transmettre
// une intervention à un prestataire/propriétaire — réutilisée ici pour que Kamel puisse la
// retransmettre dès que le technicien confirme sa date de passage.
function interventionPublicLink(interventionId: string): string {
  const baseUrl = getBaseUrl();
  return baseUrl ? `${baseUrl}/i/${interventionId}` : `/i/${interventionId}`;
}

// Même répertoire que isKnownStaffPhone (staff.ts), mais sur technicians — un numéro technicien
// ne doit jamais retomber sur l'agent client ni sur le dispatch ménage/cuisine.
export async function isKnownTechnicianPhone(phone: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ id: technicians.id }).from(technicians).where(eq(technicians.telephone, phone)).limit(1);
  return Boolean(row);
}

// Upload direct sur Vercel Blob (pas le flux client /api/blob/upload, réservé aux navigateurs) +
// rattachement à l'intervention en écriture directe — addInterventionAttachments existe déjà mais
// exige une session Clerk (auth.protect()), inadapté ici : cette fonction tourne depuis le webhook
// WhatsApp, sans utilisateur connecté (même raison que createBooking qui écrit directement dans
// reservations plutôt que d'appeler une action protégée).
async function persistAudioAttachment(interventionId: string, buffer: Buffer, label: "agent" | "technicien"): Promise<void> {
  try {
    const blob = await put(`interventions/${interventionId}/${label}-${Date.now()}.mp3`, buffer, {
      access: "public",
      contentType: "audio/mpeg",
    });
    const db = getDb();
    const [existing] = await db.select({ attachmentUrls: interventions.attachmentUrls }).from(interventions).where(eq(interventions.id, interventionId)).limit(1);
    await db
      .update(interventions)
      .set({ attachmentUrls: [...(existing?.attachmentUrls ?? []), blob.url], updatedAt: new Date() })
      .where(eq(interventions.id, interventionId));
  } catch (err) {
    console.error("Échec persistance audio intervention:", err);
  }
}

// Génère la voix ElevenLabs pour un message sortant de l'agent maintenance, l'envoie au
// technicien ET la conserve comme pièce jointe de l'intervention (Kamel, 2026-08-18 : garder
// l'historique en audio, pas seulement à l'écrit).
async function sendAndPersist(interventionId: string, phone: string, text: string): Promise<void> {
  await sendWhatsAppTextAndVoice(phone, text);
  const audio = await textToSpeech(text);
  if (audio) await persistAudioAttachment(interventionId, audio, "agent");
}

const TranslationSchema = z.object({
  titre: z.string().describe("Traduction du titre en darija marocaine authentique, écriture arabe."),
  probleme: z.string().nullable().describe("Traduction de la description du problème en darija marocaine authentique, écriture arabe, ou null si vide."),
});

// Kamel décrit toujours le problème en français (titre + probleme) — le technicien, lui, ne le
// lira qu'en darija. Sans cette étape, le message d'ouverture insérait le texte français tel
// quel au milieu d'une phrase en darija, illisible pour le technicien. Kamel, 2026-08-19 : "il va
// pas comprendre le technicien ce que tu racontes".
async function translateProblemToDarija(titre: string, probleme: string | null): Promise<{ titre: string; probleme: string | null }> {
  try {
    const message = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 300,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(TranslationSchema) },
      system:
        "Tu traduis un titre et une description de problème de maintenance, du français vers la darija marocaine authentique " +
        "(jamais l'arabe littéraire/MSA, jamais un mot de français mélangé dedans), écrite en caractères arabes. Traduis le sens " +
        "technique fidèlement, garde ça court et naturel, comme si un Marocain décrivait le problème à l'oral.",
      messages: [{ role: "user", content: `Titre : ${titre}${probleme ? `\nProblème : ${probleme}` : ""}` }],
    });
    const result = message.parsed_output;
    if (!result) return { titre, probleme };
    return { titre: result.titre, probleme: result.probleme };
  } catch (err) {
    console.error("Échec traduction darija (titre/problème) :", err);
    return { titre, probleme };
  }
}

function buildOpeningMessage(villa: string, titre: string, probleme: string | null): string {
  const detail = probleme ? ` (${probleme})` : "";
  return `السلام عليكم،\n\nكاين مشكل ف${villa} : ${titre}${detail}.\n\nواش تقدر تتكلف بهاد المهمة؟ جاوبني عافاك.\n\nموديرنا أجونسي`;
}

// Point d'entrée déclenché depuis createIntervention/addInterventionAttachments (voir
// interventions.ts) dès qu'un problème décrit + une photo sont présents et qu'aucune conversation
// n'existe déjà pour cette intervention (idempotent, même garde que initiateStaffRequest).
export async function initiateMaintenanceRequest(interventionId: string): Promise<void> {
  const db = getDb();

  const [already] = await db
    .select({ id: maintenanceConversations.id })
    .from(maintenanceConversations)
    .where(eq(maintenanceConversations.interventionId, interventionId))
    .limit(1);
  if (already) return;

  const [intervention] = await db
    .select({
      titre: interventions.titre,
      probleme: interventions.probleme,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(interventions)
    .leftJoin(villas, eq(villas.id, interventions.villaId))
    .where(eq(interventions.id, interventionId))
    .limit(1);
  if (!intervention) return;

  const match = await matchTechnicianForIntervention(interventionId);
  if (!match || match.confiance === "basse") {
    await notifyKamelMaintenance(
      `Intervention "${intervention.titre}" (${villaLabel(intervention.villaNom, intervention.villaNumero)}) : je n'ai pas trouvé de technicien évident à contacter${match ? ` (piste : ${match.technicianNom}, confiance basse)` : ""} — à assigner toi-même.`
    );
    return;
  }

  const [technician] = await db
    .select({ telephone: technicians.telephone, nom: technicians.nom, fonction: technicians.fonction })
    .from(technicians)
    .where(eq(technicians.id, match.technicianId))
    .limit(1);
  if (!technician) return;

  const [conversation] = await db
    .insert(maintenanceConversations)
    .values({ interventionId, technicianId: match.technicianId, phone: technician.telephone, statut: "en_cours" })
    .returning({ id: maintenanceConversations.id });

  const villa = villaLabel(intervention.villaNom, intervention.villaNumero);
  const darija = await translateProblemToDarija(intervention.titre, intervention.probleme);
  const opening = buildOpeningMessage(villa, darija.titre, darija.probleme);

  await db
    .update(maintenanceConversations)
    .set({ messages: [{ role: "assistant", content: [{ type: "text", text: opening }] }] })
    .where(eq(maintenanceConversations.id, conversation.id));

  await sendAndPersist(interventionId, technician.telephone, opening);

  await notifyKamelMaintenance(
    `Intervention "${intervention.titre}" (${villa}) proposée à ${technician.nom} (${technician.fonction}).`
  );
}

const tools: Tool[] = [
  {
    name: "confirmer_mission",
    description: "Le technicien accepte de s'occuper de cette intervention. Appelle ceci dès qu'il dit clairement oui, avant de lui demander quand il pourra passer.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "enregistrer_date_venue",
    description: "Le technicien a donné une date/heure de passage (même approximative, ex. 'demain matin'). Assigne réellement la mission et enregistre cette date.",
    input_schema: {
      type: "object",
      properties: { quand: { type: "string", description: "Ce que le technicien a dit sur son passage, tel quel (ex. 'demain matin', 'jeudi vers 15h')" } },
      required: ["quand"],
    },
  },
  {
    name: "decliner_mission",
    description: "Le technicien ne peut pas prendre cette mission (indisponible, pas sa spécialité...).",
    input_schema: {
      type: "object",
      properties: { raison: { type: "string", description: "Raison donnée par le technicien, résumée brièvement" } },
      required: ["raison"],
    },
  },
  {
    name: "signaler_sujet_argent",
    description: "Le technicien évoque un prix, un devis, un paiement ou toute question d'argent. Appelle ceci immédiatement, sans jamais discuter toi-même du montant.",
    input_schema: { type: "object", properties: {} },
  },
];

async function loadInterventionContext(interventionId: string) {
  const db = getDb();
  const [row] = await db
    .select({ titre: interventions.titre, probleme: interventions.probleme, villaNom: villas.nom, villaNumero: villas.numero })
    .from(interventions)
    .leftJoin(villas, eq(villas.id, interventions.villaId))
    .where(eq(interventions.id, interventionId))
    .limit(1);
  return row ?? null;
}

function buildSystemPrompt(villa: string, titre: string, probleme: string | null): string {
  return `Tu es l'agent WhatsApp de Moderna Agency (conciergerie de villas à Marrakech), tu discutes avec un technicien à propos d'une intervention de maintenance.

Intervention : "${titre}" à ${villa}.${probleme ? `\nProblème décrit par l'équipe : ${probleme}` : ""}

Règles :
- Réponds TOUJOURS en darija marocaine authentique, écrite en caractères arabes, ton chaleureux et bref (style WhatsApp, pas un pavé). Jamais d'arabe littéraire/MSA, et surtout jamais un seul mot de français ou de transcription latine mélangé dedans — même les mots techniques (date, portail, appel...) doivent être dits en darija, pas en français. Ceci vaut aussi pour tout texte que tu écris juste avant d'appeler un outil : toujours en darija pure, jamais en français.
- Dès qu'il accepte clairement la mission (avant même de connaître la date), utilise l'outil confirmer_mission, puis demande-lui quand il pourra passer.
- Dès qu'il donne une date/heure de passage (même vague), utilise enregistrer_date_venue avec ce qu'il a dit, puis confirme-lui simplement que c'est noté.
- S'il refuse ou ne peut pas prendre la mission, utilise decliner_mission avec sa raison, et dis-lui que ce n'est pas grave, merci d'avoir répondu.
- Dès que le prix, un devis, un paiement ou de l'argent est évoqué de quelque façon que ce soit, utilise IMMÉDIATEMENT signaler_sujet_argent, et réponds-lui que l'équipe va le recontacter directement pour ça — ne discute jamais toi-même d'un montant, même approximatif.
- Si le message ne correspond à aucun de ces cas (question générale, salutation...), réponds naturellement sans appeler d'outil.`;
}

async function assignTechnicianAndScheduleDate(interventionId: string, technicianId: string, quand: string): Promise<void> {
  const db = getDb();
  await db
    .update(interventions)
    .set({ technicianId, etape: "planifie", planifieAt: new Date(), updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  const [existing] = await db.select({ notes: interventions.notes }).from(interventions).where(eq(interventions.id, interventionId)).limit(1);
  const notePassage = `Passage technicien prévu : ${quand}`;
  const notes = existing?.notes ? `${existing.notes}\n${notePassage}` : notePassage;
  await db.update(interventions).set({ notes }).where(eq(interventions.id, interventionId));
}

// Boucle à tool-calling façon whatsapp-agent/agent.ts (villa client), adaptée à la conversation
// technicien : confirme la mission, note la date de passage, ou transfère vers Kamel dès que
// l'argent est évoqué — jamais négocié par l'IA elle-même (Kamel, 2026-08-18).
async function runMaintenanceAgentTurn(
  messages: MessageParam[],
  conversationId: string,
  interventionId: string,
  technicianId: string
): Promise<string> {
  const context = await loadInterventionContext(interventionId);
  const villa = villaLabel(context?.villaNom ?? null, context?.villaNumero ?? null);
  const system = buildSystemPrompt(villa, context?.titre ?? "intervention", context?.probleme ?? null);

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 500,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    }

    const db = getDb();
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown = { ok: true };
      try {
        if (block.name === "confirmer_mission") {
          await db.update(maintenanceConversations).set({ statut: "confirme" }).where(eq(maintenanceConversations.id, conversationId));
          await notifyKamelMaintenance(`"${context?.titre}" (${villa}) : le technicien confirme qu'il prend la mission — en attente de la date de passage.`);
        } else if (block.name === "enregistrer_date_venue") {
          const input = block.input as { quand: string };
          await db
            .update(maintenanceConversations)
            .set({ statut: "planifie", dateVenue: input.quand })
            .where(eq(maintenanceConversations.id, conversationId));
          await assignTechnicianAndScheduleDate(interventionId, technicianId, input.quand);
          await notifyKamelMaintenance(
            `"${context?.titre}" (${villa}) : technicien assigné, passage prévu — ${input.quand}.\nLien à transmettre au propriétaire pour suivre la mission : ${interventionPublicLink(interventionId)}`
          );
        } else if (block.name === "decliner_mission") {
          const input = block.input as { raison: string };
          await db.update(maintenanceConversations).set({ statut: "sans_reponse" }).where(eq(maintenanceConversations.id, conversationId));
          await notifyKamelMaintenance(`"${context?.titre}" (${villa}) : le technicien ne peut pas prendre la mission (${input.raison}) — à réassigner toi-même.`);
        } else if (block.name === "signaler_sujet_argent") {
          await db.update(maintenanceConversations).set({ statut: "escalade" }).where(eq(maintenanceConversations.id, conversationId));
          await notifyKamelMaintenance(`🚨 "${context?.titre}" (${villa}) : le technicien parle d'argent/devis — contacte-le directement, l'IA n'a pas négocié.`);
        } else {
          result = { erreur: "Outil inconnu" };
        }
      } catch (err) {
        console.error(`Échec outil maintenance ${block.name}:`, err);
        result = { erreur: "Un souci technique est survenu." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    // Garde-fou : l'API rejette un message user à contenu vide. stop_reason "tool_use" implique
    // normalement au moins un bloc tool_use, mais on ne repousse jamais un tableau vide au cas où.
    if (toolResults.length === 0) {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    }
    messages.push({ role: "user", content: toolResults });
  }
}

// Point d'entrée appelé par le webhook WhatsApp pour un numéro reconnu comme technicien (voir
// isKnownTechnicianPhone). Gère le chargement/sauvegarde de la conversation, la persistance audio
// (entrant si fourni, sortant systématique), et l'envoi de la réponse.
export async function handleMaintenanceMessage(
  phone: string,
  messageId: string,
  text: string,
  inboundAudioBuffer: Buffer | null
): Promise<void> {
  const db = getDb();

  const [technician] = await db.select({ id: technicians.id }).from(technicians).where(eq(technicians.telephone, phone)).limit(1);
  if (!technician) return;

  const [conversation] = await db
    .select()
    .from(maintenanceConversations)
    .where(
      and(
        eq(maintenanceConversations.technicianId, technician.id),
        // "confirme" = mission acceptée, en attente de la date de passage — toujours une
        // conversation active, pas seulement "en_cours" (avant confirmer_mission).
        or(eq(maintenanceConversations.statut, "en_cours"), eq(maintenanceConversations.statut, "confirme"))
      )
    )
    .orderBy(desc(maintenanceConversations.updatedAt))
    .limit(1);

  if (!conversation) {
    // Message d'un technicien sans mission en cours associée — accusé de réception simple, pas
    // de conversation IA à poursuivre (même esprit que handleGenericStaffMessage).
    await sendWhatsAppTextAndVoice(phone, "سلام، توصلت برسالتك، ماكاين حتى مهمة ف الطريق دابا. غادي نتواصلو معاك إلا كان شي جديد.");
    return;
  }

  if (conversation.lastMessageId === messageId) return; // doublon webhook (at-least-once)

  if (inboundAudioBuffer) await persistAudioAttachment(conversation.interventionId, inboundAudioBuffer, "technicien");

  const messages = repairMessageHistory((conversation.messages as MessageParam[]) ?? []);
  messages.push({ role: "user", content: text });

  const reply = await runMaintenanceAgentTurn(messages, conversation.id, conversation.interventionId, conversation.technicianId);

  await db
    .update(maintenanceConversations)
    .set({ messages, lastMessageId: messageId, updatedAt: new Date() })
    .where(eq(maintenanceConversations.id, conversation.id));

  await sendAndPersist(conversation.interventionId, phone, reply);
}
