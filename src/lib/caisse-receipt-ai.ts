import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Lecture par IA vision (Claude) des bons/reçus que Brahim ramène (courses, essence, produits
// ménager...) — même principe que passport-ai.ts (un seul appel vision plutôt que de la saisie
// manuelle). Kamel, 2026-09-07 : "j'aimerais que l'IA elle puisse vraiment très bien les
// analyser et que ça calcule directement [...] si tu vois des chiffres trois ou 14 etc, ça veut
// dire que c'est lié au numéro de la villa". Le résultat ne fait que préremplir le formulaire
// (montant, villa, description) — Kamel valide et confirme avant l'enregistrement en caisse,
// une lecture IA erronée ne doit jamais écrire un montant faux directement dans la comptabilité.

const client = new Anthropic();

const ReceiptSchema = z.object({
  montant: z
    .number()
    .nullable()
    .describe("Montant total payé sur le reçu/ticket, en dirhams (MAD), sans le symbole. null si illisible ou absent."),
  villa_numero: z
    .string()
    .nullable()
    .describe(
      "Numéro de villa concerné par cet achat, s'il apparaît sur le reçu — souvent écrit à la main au stylo sur ou à côté du ticket (ex. '3', '14'), parfois imprimé. null si aucun numéro de villa n'apparaît."
    ),
  description: z
    .string()
    .describe("Description courte de l'achat en français (ex. 'Produit ménager', 'Essence', 'Pièces plomberie'). Chaîne vide si illisible."),
  avertissements: z
    .array(z.string())
    .describe("Alertes courtes en français sur des champs incertains à vérifier manuellement. Tableau vide si tout est net."),
});

export type ReceiptExtraction = {
  montant: number | null;
  villaNumero: string | null;
  description: string;
  warnings: string[];
};

export async function analyzeCashReceipt(photoUrls: string[]): Promise<ReceiptExtraction> {
  if (photoUrls.length === 0) throw new Error("Aucune photo à analyser.");

  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(ReceiptSchema) },
    system:
      "Tu lis un reçu/ticket de courses ramené par un coursier (Brahim) pour préremplir une dépense de caisse. " +
      "Le montant est le TOTAL payé (pas un sous-total ni un rendu de monnaie). Le numéro de villa, quand il " +
      "existe, est souvent noté à la main (au stylo, entouré ou griffonné) sur le ticket lui-même ou sur un " +
      "papier à côté — cherche un nombre isolé qui ressemble à un numéro de villa (ex. '3', '14'), distinct " +
      "des prix et quantités de la liste d'articles. Ne devine et n'invente jamais une valeur incertaine : " +
      "laisse-la à null/vide et signale-le dans avertissements plutôt que d'approximer. S'il y a plusieurs " +
      "photos, elles peuvent être plusieurs tickets d'un même achat (additionne les montants) ou plusieurs " +
      "vues du même ticket (recto/verso, floue + nette) — utilise le bon sens.",
    messages: [
      {
        role: "user",
        content: [
          ...photoUrls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
          { type: "text" as const, text: "Lis ce(s) reçu(s)." },
        ],
      },
    ],
  });

  const result = message.parsed_output;
  if (!result) throw new Error("Réponse IA invalide (pas de lecture structurée).");

  return {
    montant: result.montant,
    villaNumero: result.villa_numero,
    description: result.description,
    warnings: result.avertissements,
  };
}
