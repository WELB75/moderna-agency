import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Traducteur de la boîte de réception (Airbnb / Booking.com via Beds24) — Kamel, 2026-10-13 :
// "on reçoit les messages dans leur langue à eux et nous, on ne comprend pas [...] quand on leur
// répondra en français, ça traduira".

const client = new Anthropic();

export type TraductionRecue = {
  fr: string; // traduction française (le texte d'origine tel quel s'il est déjà en français)
  langue: string; // nom de la langue d'origine, en français ("italien", "anglais"...)
  estFrancais: boolean;
};

const RecuesSchema = z.object({
  messages: z.array(
    z.object({
      index: z.number().int().describe("Index du message dans la liste fournie."),
      langue: z.string().describe('Langue du message, en français et en minuscules (ex. "italien", "anglais", "arabe").'),
      est_francais: z.boolean().describe("true si le message est déjà en français."),
      traduction_fr: z.string().describe("Traduction fidèle en français. Copie le texte tel quel s'il est déjà en français."),
    })
  ),
});

export async function traduireVersFrancais(textes: string[]): Promise<TraductionRecue[]> {
  if (textes.length === 0) return [];
  const liste = textes.map((t, index) => `[${index}]\n${t}`).join("\n\n---\n\n");
  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(RecuesSchema) },
    system:
      "Tu traduis des messages de voyageurs d'une conciergerie de locations de vacances (Marrakech) vers le " +
      "français, pour l'équipe. Traduction fidèle et naturelle, sans rien ajouter ni commenter. Conserve les " +
      "liens, numéros et prénoms tels quels. Identifie la langue de chaque message.",
    messages: [{ role: "user", content: `Traduis chacun de ces messages :\n\n${liste}` }],
  });
  const out = message.parsed_output;
  if (!out) throw new Error("Traduction indisponible.");
  return textes.map((original, i) => {
    const r = out.messages.find((m) => m.index === i);
    if (!r) return { fr: original, langue: "français", estFrancais: true };
    return { fr: r.traduction_fr || original, langue: r.langue, estFrancais: r.est_francais };
  });
}

export async function traduireVersLangue(texte: string, langue: string): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system:
      `Tu traduis du français vers la langue suivante : ${langue}. C'est une réponse de la conciergerie ` +
      "Moderna Agency à un voyageur d'Airbnb/Booking.com : ton poli et chaleureux, fidèle au sens, " +
      "sans rien ajouter. Réponds uniquement avec la traduction, sans guillemets ni commentaire.",
    messages: [{ role: "user", content: texte }],
  });
  const block = message.content.find((b) => b.type === "text");
  const out = block && block.type === "text" ? block.text.trim() : "";
  if (!out) throw new Error("Traduction indisponible.");
  return out;
}
