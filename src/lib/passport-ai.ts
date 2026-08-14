import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import sharp from "sharp";
import { nationaliteFromCode } from "@/lib/nationalites";
import { normalizeIdPhotoBuffer } from "@/lib/id-photo-normalize";
import type { PassportExtraction, PassportField } from "@/lib/passport-ocr";

// Lecture de passeport par IA vision (Claude) : remplace la lecture MRZ locale (passport-ocr.ts,
// gardée comme repli si l'appel échoue) car bien plus rapide (un seul appel, pas de recherche sur
// 4 rotations) et bien plus robuste sur des photos réelles (floues, penchées, mal cadrées) — un
// modèle vision comprend le document au lieu de faire du template-matching de caractères.
// Kamel, 2026-08-14 : "c trop lent, on va tester l'ia".

const client = new Anthropic();

const PassportSchema = z.object({
  rotation_degrees: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .describe("Rotation horaire à appliquer à l'image pour que le passeport soit à l'endroit. 0 si déjà à l'endroit."),
  nom: z.string().describe("Nom de famille tel qu'imprimé / dans la MRZ, chaîne vide si illisible."),
  prenom: z.string().describe("Prénom(s), chaîne vide si illisible."),
  date_naissance: z.string().describe("Date de naissance au format YYYY-MM-DD, chaîne vide si illisible."),
  nationalite_code: z
    .string()
    .describe("Code pays ICAO alpha-3 de la nationalité (ex. FRA, MAR, USA, GBR...), chaîne vide si illisible."),
  numero_piece: z.string().describe("Numéro du passeport, chaîne vide si illisible."),
  avertissements: z
    .array(z.string())
    .describe(
      "Alertes courtes en français sur des champs incertains/illisibles à vérifier manuellement (ex. \"Date de naissance floue, à vérifier\"). Tableau vide si tout est net."
    ),
});

function mimeTypeToClaudeMedia(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

export async function extractPassportAI(inputBuffer: Buffer, mimeType: string): Promise<PassportExtraction> {
  // Respecte d'abord un éventuel tag EXIF d'orientation (photos iPhone/Android récentes) — le
  // reste de la rotation (photos sans EXIF, prises de travers) est demandé au modèle ci-dessous.
  const upright: Buffer = await sharp(inputBuffer).rotate().toBuffer();
  const media_type = mimeTypeToClaudeMedia(mimeType);
  const data = upright.toString("base64");

  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(PassportSchema) },
    system:
      "Tu lis une photo de passeport (n'importe quel pays) pour préremplir une fiche de police marocaine. " +
      "Base-toi en priorité sur la bande MRZ (les deux lignes de lettres/chiffres/< tout en bas de la page " +
      "bio) si elle est visible et nette, sinon sur les champs imprimés au-dessus. Ne devine et n'invente " +
      "jamais une valeur : si un champ n'est pas lisible avec certitude, laisse-le en chaîne vide et " +
      "signale-le dans avertissements plutôt que d'approximer.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type, data } },
          { type: "text", text: "Lis ce passeport." },
        ],
      },
    ],
  });

  const result = message.parsed_output;
  if (!result) throw new Error("Réponse IA invalide (pas de lecture structurée).");

  const rotated: Buffer = result.rotation_degrees ? await sharp(upright).rotate(result.rotation_degrees).toBuffer() : upright;
  const outputBuffer = await normalizeIdPhotoBuffer(rotated);

  const fields: Partial<PassportField> = {};
  const warnings = [...result.avertissements];

  if (result.nom) fields.nom = result.nom;
  if (result.prenom) fields.prenom = result.prenom;
  if (result.date_naissance) fields.dateNaissance = result.date_naissance;
  if (result.numero_piece) fields.numeroPiece = result.numero_piece;
  if (result.nom || result.prenom || result.numero_piece) fields.typePiece = "Passeport";

  const nat = nationaliteFromCode(result.nationalite_code);
  if (nat) {
    fields.nationalite = nat.nationalite;
    fields.venantDe = nat.pays;
  } else if (result.nationalite_code) {
    warnings.push(`Nationalité "${result.nationalite_code}" non reconnue — à compléter à la main.`);
  }

  const fieldsFound = Boolean(result.nom && result.prenom && result.numero_piece);
  if (!fieldsFound && warnings.length === 0) {
    warnings.push("Passeport lu partiellement — vérifie et complète les champs manquants.");
  }

  return {
    fields,
    photoDataUrl: `data:image/jpeg;base64,${outputBuffer.toString("base64")}`,
    mrzFound: fieldsFound,
    mrzValid: fieldsFound,
    warnings,
  };
}
