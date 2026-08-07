import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { cashEntries, villas, domaines } from "@/db/schema";

const client = new Anthropic();

const tools: Tool[] = [
  {
    name: "record_cash_entry",
    description:
      "Enregistre un mouvement de caisse (dépense, loyer reçu, extra, argent confié, ou restitution). Appeler dès que Kamel décrit un mouvement d'argent clair, même en une phrase courte.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["depense", "loyer", "extra", "remise", "restitution"],
          description:
            "depense = argent donné/dépensé ; loyer = paiement de location reçu d'un client ; extra = recette annexe (petit-déj, options, caution retenue...) ; remise = argent confié à l'agence pour les dépenses courantes ; restitution = argent rendu à un client.",
        },
        montant: { type: "number", description: "Montant, toujours positif." },
        devise: { type: "string", enum: ["MAD", "EUR"], description: "Par défaut MAD si non précisé." },
        description: { type: "string", description: "Résumé court et clair du mouvement (qui, pourquoi)." },
        responsable: { type: "string", description: "Personne concernée (à qui donné, ou qui a payé), si connue." },
        villaNom: { type: "string", description: "Nom exact de la villa concernée si mentionnée, sinon omettre." },
      },
      required: ["type", "montant", "description"],
    },
  },
  {
    name: "cancel_last_entry",
    description:
      "Annule/supprime le tout dernier mouvement de caisse enregistré par cet agent dans cette conversation (ex. Kamel dit \"non c'est faux\", \"annule\", \"erreur\"). N'annule jamais un mouvement plus ancien que le dernier.",
    input_schema: { type: "object", properties: {} },
  },
];

function buildSystemPrompt(today: string, villasPromptList: string) {
  return `Tu es l'assistant personnel de Kamel sur Telegram, pour Moderna Agency (conciergerie de villas à Marrakech). Il te dicte des mouvements d'argent (texte ou vocal transcrit) et tu les notes directement dans la caisse de l'application. Ton seul interlocuteur est Kamel lui-même — jamais de client, jamais d'employé.

Date d'aujourd'hui : ${today}.

Villas connues (utilise le nom exact si Kamel en mentionne une, corrige les fautes/surnoms) :
- ${villasPromptList}

Règles :
- Réponds en français, ton bref et naturel, façon message Telegram (pas de pavés).
- Dès que Kamel décrit un mouvement d'argent clair (même une phrase courte comme "j'ai donné 2000 MAD à Brahim"), appelle record_cash_entry directement — ne demande pas de confirmation avant d'enregistrer, mais confirme après coup ce que tu as noté, en une phrase claire, pour qu'il puisse corriger si besoin.
- Si le montant ou la devise sont ambigus, demande une précision avant d'enregistrer plutôt que de deviner.
- Si Kamel corrige ou dit que c'est faux juste après un enregistrement, utilise cancel_last_entry puis ré-enregistre avec les bonnes infos si les infos correctes sont données.
- Devise par défaut MAD si rien n'est précisé et que le contexte est marocain (paiement personnel local) ; EUR seulement si explicitement mentionné ou évident (ex. "€").
- Tu ne fais QUE la caisse pour l'instant (dépenses, loyers, extras, argent confié, restitutions) — pour toute autre demande (ménage, réservations...), dis simplement que ce n'est pas encore géré ici et que ça passe par l'application normale.`;
}

async function getVillasPromptList(): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ nom: villas.nom, numero: villas.numero, domaineNom: domaines.nom })
    .from(villas)
    .leftJoin(domaines, eq(villas.domaineId, domaines.id));
  return rows.map((v) => `${v.nom} (n°${v.numero}${v.domaineNom ? `, ${v.domaineNom}` : ""})`).join("\n- ");
}

async function findVillaId(villaNom: string | undefined): Promise<string | null> {
  if (!villaNom) return null;
  const db = getDb();
  const rows = await db.select({ id: villas.id, nom: villas.nom }).from(villas);
  const match = rows.find((v) => v.nom.toLowerCase() === villaNom.toLowerCase());
  return match?.id ?? null;
}

// Mémorisé en variable de module le temps du process serverless, juste pour permettre
// cancel_last_entry dans le même tour d'outils si jamais Kamel corrige immédiatement — la vraie
// source de vérité reste la requête SQL "dernière entrée créée par cet agent" ci-dessous.
async function recordCashEntry(input: Record<string, unknown>) {
  const db = getDb();
  const villaId = await findVillaId(input.villaNom as string | undefined);
  const [entry] = await db
    .insert(cashEntries)
    .values({
      villaId,
      type: input.type as "depense" | "loyer" | "extra" | "remise" | "restitution",
      moyenPaiement: "especes",
      montant: String(input.montant),
      devise: (input.devise as string) || "MAD",
      description: String(input.description),
      responsable: (input.responsable as string) || null,
      photoUrls: [],
      createdByUserId: "telegram-agent",
      createdByName: "Kamel (Telegram)",
    })
    .returning();
  return { ok: true, id: entry.id, type: entry.type, montant: entry.montant, devise: entry.devise };
}

async function cancelLastEntry() {
  const db = getDb();
  const [last] = await db
    .select()
    .from(cashEntries)
    .where(eq(cashEntries.createdByUserId, "telegram-agent"))
    .orderBy(desc(cashEntries.createdAt))
    .limit(1);
  if (!last) return { ok: false, erreur: "Rien à annuler." };
  await db.delete(cashEntries).where(eq(cashEntries.id, last.id));
  return { ok: true, annule: { type: last.type, montant: last.montant, devise: last.devise, description: last.description } };
}

export async function runAgentTurn(messages: MessageParam[]): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const villasPromptList = await getVillasPromptList();
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: buildSystemPrompt(today, villasPromptList), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "";
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        if (block.name === "record_cash_entry") {
          result = await recordCashEntry(block.input as Record<string, unknown>);
        } else if (block.name === "cancel_last_entry") {
          result = await cancelLastEntry();
        } else {
          result = { erreur: "Outil inconnu" };
        }
      } catch (err) {
        console.error(`Échec outil ${block.name}:`, err);
        result = { erreur: "Un souci technique est survenu pendant cette action." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }
}

// Même logique que whatsapp-agent : un tool_use en fin d'historique sans tool_result associé
// (coupure réseau, timeout) casserait tout appel suivant à l'API si on ne le nettoie pas.
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
