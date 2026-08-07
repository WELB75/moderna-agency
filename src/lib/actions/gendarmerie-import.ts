"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants } from "@/db/schema";
import { extractPassport } from "@/lib/passport-ocr";
import { normalizeIdPhotoDataUrl } from "@/lib/id-photo-normalize";
import { emptyOccupant } from "@/lib/gendarmerie-i18n";
import type { OccupantInput } from "@/lib/actions/gendarmerie";

export type PassportAnalysis = {
  occupant: OccupantInput;
  warnings: string[];
  mrzFound: boolean;
  mrzValid: boolean;
};

// Lecture 100% locale (OCR + MRZ), sans API IA payante — voir src/lib/passport-ocr.ts pour les
// limites : fiable sur nom/prénom/naissance/nationalité/numéro quand la MRZ est lue, sinon les
// champs restent vides et sont à saisir à la main dans l'écran de relecture.
export async function analyzePassportImage(formData: FormData): Promise<PassportAnalysis> {
  await auth.protect();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Fichier manquant.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractPassport(buffer);

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
