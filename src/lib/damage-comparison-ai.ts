import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { eq, and, lt, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryChecklists, inventoryItems, usureReferences } from "@/db/schema";
import { loadImageBuffer } from "@/lib/fetch-image-buffer";

// Compare l'état d'entrée et de sortie d'une villa, objet par objet, pour aider Kamel/le staff à
// distinguer usure normale et dégât facturable — jamais de décision automatique sur l'argent (la
// classification IA n'est retenue que quand le modèle est confiant, sinon elle reste "à définir"
// pour arbitrage humain), même principe que matchTechnicianForIntervention dans maintenance-ai.ts.

const client = new Anthropic();

function mimeTypeToClaudeMedia(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

// loadImageBuffer accepte aussi bien une data URL ("data:image/png;base64,...") qu'une URL
// http(s) (ex. Vercel Blob) — il faut donc lire le mime type dans la data URL elle-même quand il y
// en a une, plutôt que de deviner sur l'extension du lien (qui n'existe pas pour une data URL).
const DATA_URL_MIME_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/;

function guessMimeType(url: string): string {
  const dataUrlMatch = DATA_URL_MIME_RE.exec(url);
  if (dataUrlMatch) return dataUrlMatch[1];
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

type ImageBlock = { type: "image"; source: { type: "base64"; media_type: ReturnType<typeof mimeTypeToClaudeMedia>; data: string } };

async function loadImageBlocks(urls: string[]): Promise<ImageBlock[]> {
  const blocks: ImageBlock[] = [];
  for (const url of urls) {
    const buffer = await loadImageBuffer(url).catch(() => null);
    if (!buffer) continue;
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: mimeTypeToClaudeMedia(guessMimeType(url)), data: buffer.toString("base64") },
    });
  }
  return blocks;
}

const ComparisonSchema = z.object({
  difference_detectee: z
    .boolean()
    .describe(
      "true si une différence visible entre les photos d'entrée et de sortie (ou, à défaut de photo d'entrée, un défaut visible sur la photo de sortie) suggère un dégât ou un changement anormal, false si rien de notable."
    ),
  explication: z
    .string()
    .describe("Explication courte en français de ce qui a été observé, ou de l'absence de différence."),
  suggestion: z
    .enum(["usure_normale", "degat_facturable", "incertain"])
    .describe(
      "Classification suggérée. \"incertain\" si difference_detectee est faux, ou si les photos ne permettent pas de trancher avec une confiance raisonnable — dans ce cas la décision reste à un humain."
    ),
});

async function callComparisonAI(input: {
  categorie: string;
  libelle: string;
  referencesText: string;
  entreeImages: ImageBlock[];
  sortieImages: ImageBlock[];
}): Promise<z.infer<typeof ComparisonSchema>> {
  const content: (ImageBlock | { type: "text"; text: string })[] = [];

  if (input.entreeImages.length > 0) {
    content.push({ type: "text", text: `Photos à l'entrée du locataire pour "${input.libelle}" (catégorie: ${input.categorie}) :` });
    content.push(...input.entreeImages);
    content.push({ type: "text", text: `Photos au départ du locataire pour ce même objet :` });
    content.push(...input.sortieImages);
  } else {
    content.push({
      type: "text",
      text:
        `Aucune photo d'entrée disponible pour "${input.libelle}" (catégorie: ${input.categorie}). ` +
        `Évalue uniquement l'état visible sur ces photos prises au départ du locataire, en te demandant si ce que tu vois est cohérent avec un usage normal ou trahit un dégât.`,
    });
    content.push(...input.sortieImages);
  }

  const message = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 500,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(ComparisonSchema) },
    system:
      "Tu aides une agence de conciergerie de villas à préparer un état des lieux de sortie. Pour un objet donné, " +
      "compare son état à l'entrée et à la sortie du locataire (ou évalue son état seul si aucune photo d'entrée " +
      "n'existe) et signale toute différence qui ressemble à un dégât plutôt qu'à de l'usure normale. " +
      "Voici la grille de référence usure vs dégât par type d'objet (peut ne pas couvrir exactement cette catégorie, " +
      "utilise-la comme repère de bon sens) :\n\n" +
      input.referencesText +
      "\n\nSois prudent : ne conclus à un dégât que si c'est visuellement net. En cas de doute, réponds \"incertain\" " +
      "plutôt que de deviner — la décision finale revient toujours à un humain.",
    messages: [{ role: "user", content }],
  });

  const result = message.parsed_output;
  if (!result) throw new Error("Réponse IA invalide (pas de comparaison structurée).");
  return result;
}

export async function compareChecklistWithEntree(sortieChecklistId: string): Promise<{ analyses: number; differences: number }> {
  const db = getDb();

  const [sortie] = await db.select().from(inventoryChecklists).where(eq(inventoryChecklists.id, sortieChecklistId)).limit(1);
  if (!sortie) throw new Error("État des lieux introuvable.");
  if (sortie.type !== "sortie") throw new Error("La comparaison ne s'applique qu'à un état des lieux de sortie.");
  if (!sortie.villaId) throw new Error("Cet état des lieux n'est rattaché à aucune villa.");

  let entree = undefined as typeof sortie | undefined;

  if (sortie.reservationId) {
    [entree] = await db
      .select()
      .from(inventoryChecklists)
      .where(
        and(
          eq(inventoryChecklists.villaId, sortie.villaId),
          eq(inventoryChecklists.type, "entree"),
          eq(inventoryChecklists.reservationId, sortie.reservationId)
        )
      )
      .orderBy(desc(inventoryChecklists.createdAt))
      .limit(1);
  }

  if (!entree) {
    [entree] = await db
      .select()
      .from(inventoryChecklists)
      .where(
        and(
          eq(inventoryChecklists.villaId, sortie.villaId),
          eq(inventoryChecklists.type, "entree"),
          lt(inventoryChecklists.createdAt, sortie.createdAt)
        )
      )
      .orderBy(desc(inventoryChecklists.createdAt))
      .limit(1);
  }

  if (!entree) throw new Error("Aucun état des lieux d'entrée trouvé pour cette villa/réservation.");

  const [sortieItems, entreeItems, references] = await Promise.all([
    db.select().from(inventoryItems).where(eq(inventoryItems.checklistId, sortie.id)),
    db.select().from(inventoryItems).where(eq(inventoryItems.checklistId, entree.id)),
    db.select().from(usureReferences),
  ]);

  const entreeByKey = new Map<string, (typeof entreeItems)[number]>();
  for (const item of entreeItems) entreeByKey.set(`${item.categorie}::${item.libelle}`, item);

  const referencesText = references.length
    ? references
        .map(
          (r) =>
            `- ${r.typeObjet}${r.dureeVieAttendueMois ? ` (durée de vie attendue ~${r.dureeVieAttendueMois} mois)` : ""}${
              r.criteres ? ` : ${r.criteres}` : ""
            }`
        )
        .join("\n")
    : "Aucune grille de référence définie — utilise ton jugement sur ce qui constitue une usure normale vs un dégât anormal.";

  let analyses = 0;
  let differences = 0;

  for (const sortieItem of sortieItems) {
    const photoUrls = sortieItem.photoUrls ?? [];
    if (photoUrls.length === 0) continue;

    const entreeItem = entreeByKey.get(`${sortieItem.categorie}::${sortieItem.libelle}`);
    const entreePhotoUrls = entreeItem?.photoUrls ?? [];

    const [sortieImages, entreeImages] = await Promise.all([
      loadImageBlocks(photoUrls.slice(0, 2)),
      loadImageBlocks(entreePhotoUrls.slice(0, 2)),
    ]);
    if (sortieImages.length === 0) continue;

    const verdict = await callComparisonAI({
      categorie: sortieItem.categorie,
      libelle: sortieItem.libelle,
      referencesText,
      entreeImages,
      sortieImages,
    });

    analyses++;
    if (verdict.difference_detectee) differences++;

    await db
      .update(inventoryItems)
      .set({
        compareStatus: verdict.difference_detectee ? "difference_detectee" : "rien_a_signaler",
        compareExplication: verdict.explication,
        entreeItemId: entreeItem?.id ?? null,
        usureClassification: verdict.suggestion === "incertain" ? "a_definir" : verdict.suggestion,
      })
      .where(eq(inventoryItems.id, sortieItem.id));
  }

  await db.update(inventoryChecklists).set({ comparedAt: new Date() }).where(eq(inventoryChecklists.id, sortie.id));

  return { analyses, differences };
}
