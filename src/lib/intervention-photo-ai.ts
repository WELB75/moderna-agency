import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "@/lib/intervention-categorie";

// Lecture par IA vision (Claude) d'une photo de problème constaté sur une villa — même principe
// que caisse-receipt-ai.ts et passport-ai.ts. Kamel, 2026-09-09 : "je veux un formulaire propre
// avec ia j'ai juste a prendre en photo, ou video, ou importer" — un seul geste (ajouter la
// photo) préremplit le souci, la catégorie et l'urgence, plutôt que de tout taper à la main.

const client = new Anthropic();

const CATEGORIE_KEYS = CATEGORIES.map((c) => c.key) as [string, ...string[]];

const InterventionSchema = z.object({
  probleme: z
    .string()
    .describe(
      "Description courte et claire du problème visible sur la photo, en français, prête à servir de titre (ex. 'Fissure sur la porte pivot', 'Rideau décroché de la tringle'). Chaîne vide si la photo ne montre pas de problème identifiable."
    ),
  categorie: z.enum(CATEGORIE_KEYS).describe("Catégorie la plus proche parmi la liste fournie."),
  urgence: z
    .enum(["basse", "normale", "haute", "critique"])
    .describe(
      "Niveau d'urgence apparent : critique = risque de sécurité/incendie/dégât des eaux immédiat, haute = gêne importante ou risque de s'aggraver, normale = à réparer sans urgence particulière, basse = cosmétique/confort."
    ),
  avertissements: z
    .array(z.string())
    .describe("Alertes courtes en français si le problème n'est pas clairement identifiable. Tableau vide sinon."),
});

export type InterventionPhotoExtraction = {
  probleme: string;
  categorie: string;
  urgence: "basse" | "normale" | "haute" | "critique";
  warnings: string[];
};

export async function analyzeInterventionPhoto(photoUrl: string): Promise<InterventionPhotoExtraction> {
  const categorieList = CATEGORIES.map((c) => `${c.key} (${c.label})`).join(", ");

  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 400,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(InterventionSchema) },
    system:
      "Tu regardes une photo prise par l'équipe d'une agence de gestion de villas à Marrakech, qui documente un problème à réparer (dégât, panne, usure, propreté...) pour créer une fiche d'intervention. " +
      `Choisis la catégorie la plus proche parmi : ${categorieList}. ` +
      "Décris le problème en une phrase courte et concrète, comme le ferait quelqu'un sur place (pas de jargon). " +
      "Si la photo ne montre clairement aucun problème (photo floue, pièce normale, personne...), laisse probleme vide et signale-le dans avertissements plutôt que d'inventer un problème.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: photoUrl } },
          { type: "text", text: "Analyse cette photo pour une fiche d'intervention." },
        ],
      },
    ],
  });

  const result = message.parsed_output;
  if (!result) throw new Error("Réponse IA invalide (pas de lecture structurée).");

  return {
    probleme: result.probleme,
    categorie: result.categorie,
    urgence: result.urgence,
    warnings: result.avertissements,
  };
}
