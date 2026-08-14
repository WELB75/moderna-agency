"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants } from "@/db/schema";
import { extractPassport } from "@/lib/passport-ocr";
import { extractPassportAI } from "@/lib/passport-ai";
import { normalizeIdPhotoDataUrl } from "@/lib/id-photo-normalize";
import { emptyOccupant } from "@/lib/gendarmerie-i18n";
import type { OccupantInput } from "@/lib/actions/gendarmerie";

export type PassportAnalysis = {
  occupant: OccupantInput;
  warnings: string[];
  mrzFound: boolean;
  mrzValid: boolean;
};

async function runPassportAnalysis(formData: FormData): Promise<PassportAnalysis> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Fichier manquant.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Photo trop lourde (max 15 Mo).");

  const buffer = Buffer.from(await file.arrayBuffer());
  let result: Awaited<ReturnType<typeof extractPassport>>;
  try {
    result = await extractPassportAI(buffer, file.type);
  } catch (err) {
    console.error("Lecture passeport par IA indisponible, repli sur l'OCR local :", err);
    result = await extractPassport(buffer);
  }

  const occupant: OccupantInput = {
    ...emptyOccupant(),
    nom: result.fields.nom ?? "",
    prenom: result.fields.prenom ?? "",
    dateNaissance: result.fields.dateNaissance ?? "",
    nationalite: result.fields.nationalite ?? "",
    venantDe: result.fields.venantDe ?? "",
    typePiece: result.fields.typePiece ?? "",
    numeroPiece: result.fields.numeroPiece ?? "",
    photoPieceUrl: result.photoDataUrl,
  };

  return { occupant, warnings: result.warnings, mrzFound: result.mrzFound, mrzValid: result.mrzValid };
}

// Lecture par IA vision (voir src/lib/passport-ai.ts), avec repli automatique sur l'OCR MRZ local
// (src/lib/passport-ocr.ts) si l'appel IA échoue (clé absente, quota, réseau...) — dans les deux
// cas les champs non lus avec certitude restent vides, à saisir à la main dans l'écran de relecture.
export async function analyzePassportImage(formData: FormData): Promise<PassportAnalysis> {
  await auth.protect();
  return runPassportAnalysis(formData);
}

// Volontairement sans auth.protect() : appelée depuis le formulaire public /g/[id] pour que le
// client scanne lui-même son passeport (au lieu de tout ressaisir à la main). Sécurisée par le
// même principe que le reste du flux public : il faut connaître l'identifiant (non devinable) du
// formulaire, et celui-ci doit exister et ne pas être déjà complété.
export async function analyzePassportImagePublic(formId: string, formData: FormData): Promise<PassportAnalysis> {
  const db = getDb();
  const [form] = await db
    .select({ id: gendarmerieForms.id, statut: gendarmerieForms.statut })
    .from(gendarmerieForms)
    .where(eq(gendarmerieForms.id, formId))
    .limit(1);
  if (!form) throw new Error("Formulaire introuvable.");
  if (form.statut === "complete") throw new Error("Ce formulaire a déjà été rempli.");

  return runPassportAnalysis(formData);
}

export async function saveImportedGendarmerieForm(villaId: string, occupants: OccupantInput[]) {
  await auth.protect();
  const user = await currentUser();

  if (!villaId) throw new Error("Choisis une villa ou un appartement.");
  const validOccupants = occupants.filter((o) => o.nom.trim() || o.prenom.trim());
  if (validOccupants.length === 0) throw new Error("Ajoute au moins un occupant.");

  // Re-normalise ici même si extractPassport() l'a déjà fait : le staff a pu recadrer/tourner
  // la photo manuellement dans l'écran de relecture avant d'enregistrer (rotateRow dans
  // PassportDropZone), ce qui contourne le recadrage automatique.
  const normalizedOccupants = await Promise.all(
    validOccupants.map(async (o) => ({
      ...o,
      photoPieceUrl: o.photoPieceUrl ? await normalizeIdPhotoDataUrl(o.photoPieceUrl) : o.photoPieceUrl,
    }))
  );

  const db = getDb();
  const [form] = await db
    .insert(gendarmerieForms)
    .values({
      villaId,
      reservationId: null,
      statut: "complete",
      langue: "fr",
      completedAt: new Date(),
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  await db.insert(gendarmerieOccupants).values(
    normalizedOccupants.map((o) => ({
      formId: form.id,
      nom: o.nom.trim() || null,
      prenom: o.prenom.trim() || null,
      dateNaissance: o.dateNaissance.trim() || null,
      lieuNaissance: o.lieuNaissance.trim() || null,
      nationalite: o.nationalite.trim() || null,
      profession: o.profession.trim() || null,
      venantDe: o.venantDe.trim() || null,
      allantA: o.allantA.trim() || null,
      dateArrivee: o.dateArrivee.trim() || null,
      domicileHabituel: o.domicileHabituel.trim() || null,
      typePiece: o.typePiece.trim() || null,
      numeroPiece: o.numeroPiece.trim() || null,
      datePiece: o.datePiece.trim() || null,
      lieuPiece: o.lieuPiece.trim() || null,
      signatureNom: null,
      signatureImage: null,
      photoPieceUrl: o.photoPieceUrl || null,
    }))
  );

  revalidatePath("/documents");
  return { id: form.id };
}
