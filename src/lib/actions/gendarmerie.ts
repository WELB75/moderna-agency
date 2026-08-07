"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants } from "@/db/schema";
import { normalizeIdPhotoBuffer, normalizeIdPhotoDataUrl, loadImageBuffer } from "@/lib/id-photo-normalize";

export type OccupantInput = {
  nom: string;
  prenom: string;
  dateNaissance: string;
  lieuNaissance: string;
  nationalite: string;
  profession: string;
  venantDe: string;
  allantA: string;
  dateArrivee: string;
  domicileHabituel: string;
  typePiece: string;
  numeroPiece: string;
  datePiece: string;
  lieuPiece: string;
  signatureNom: string;
  signatureImage: string;
  photoPieceUrl: string;
};

export async function createGendarmerieForm(reservationId: string | null, villaId: string | null) {
  await auth.protect();
  const user = await currentUser();

  const db = getDb();
  const [form] = await db
    .insert(gendarmerieForms)
    .values({
      reservationId,
      villaId,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath("/villas");
  if (villaId) revalidatePath(`/villas/${villaId}`);
  return form;
}

// Un Bulletin Individuel est censé être rempli par une seule personne majeure : quand
// plusieurs adultes séjournent ensemble, on génère un lien distinct par adulte plutôt
// qu'un seul lien partagé (contrairement au contrat de location, qui reste unique par famille).
export async function generateGendarmerieForms(villaId: string, nbAdultes: number) {
  await auth.protect();
  const user = await currentUser();
  const count = Math.min(Math.max(Math.round(nbAdultes), 1), 20);

  const db = getDb();
  const forms = await db
    .insert(gendarmerieForms)
    .values(
      Array.from({ length: count }, () => ({
        villaId,
        reservationId: null,
        createdByUserId: user?.id ?? null,
        createdByName: user?.fullName ?? user?.username ?? "Équipe",
      }))
    )
    .returning();

  revalidatePath("/documents");
  return forms;
}

// Pour un groupe qui préfère tout remplir sur le même lien plutôt qu'un lien par adulte :
// une seule fiche, pré-remplie avec le nombre d'adultes et d'enfants indiqué à la création.
export async function createGroupGendarmerieForm(villaId: string, nbAdultes: number, nbEnfants: number) {
  await auth.protect();
  const user = await currentUser();
  const safeAdultes = Math.min(Math.max(Math.round(nbAdultes), 1), 20);
  const safeEnfants = Math.min(Math.max(Math.round(nbEnfants), 0), 20);

  const db = getDb();
  const [form] = await db
    .insert(gendarmerieForms)
    .values({
      villaId,
      reservationId: null,
      nbAdultesPrevu: safeAdultes,
      nbEnfantsPrevu: safeEnfants,
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath("/documents");
  return form;
}

// Volontairement sans auth.protect() : le client remplit via le lien public /g/[id],
// sans se connecter.
export async function submitGendarmerieOccupants(
  formId: string,
  langue: string,
  occupants: OccupantInput[],
  enfantsPassportUrls: string[] = []
) {
  const db = getDb();

  const [form] = await db.select().from(gendarmerieForms).where(eq(gendarmerieForms.id, formId)).limit(1);
  if (!form) throw new Error("Formulaire introuvable.");

  const validOccupants = occupants.filter((o) => o.nom.trim() || o.prenom.trim());
  if (validOccupants.length === 0) throw new Error("Ajoute au moins un occupant.");

  const [normalizedOccupants, normalizedEnfantsPassportUrls] = await Promise.all([
    Promise.all(
      validOccupants.map(async (o) => ({
        ...o,
        photoPieceUrl: o.photoPieceUrl ? await normalizeIdPhotoDataUrl(o.photoPieceUrl) : o.photoPieceUrl,
      }))
    ),
    Promise.all(enfantsPassportUrls.map((url) => normalizeIdPhotoDataUrl(url))),
  ]);

  await db.insert(gendarmerieOccupants).values(
    normalizedOccupants.map((o) => ({
      formId,
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
      signatureNom: o.signatureNom.trim() || null,
      signatureImage: o.signatureImage || null,
      photoPieceUrl: o.photoPieceUrl || null,
    }))
  );

  await db
    .update(gendarmerieForms)
    .set({ statut: "complete", langue, enfantsPassportUrls: normalizedEnfantsPassportUrls, completedAt: new Date() })
    .where(eq(gendarmerieForms.id, formId));

  revalidatePath("/villas");
  revalidatePath(`/g/${formId}`);
}

// Cas d'usage : Kamel reçoit les passeports/CIN directement (photo WhatsApp) et remplit lui-même
// les informations des occupants (comme submitGendarmerieOccupants), mais SANS signature —
// le client n'a plus ensuite qu'à ouvrir le lien /g/[id] et signer ce qui est déjà rempli,
// au lieu de tout ressaisir. Le statut "attente_signature" fait basculer la page publique vers
// une vue de relecture + signature uniquement (voir GendarmerieSignatureForm).
export async function prefillGendarmerieOccupants(
  formId: string,
  occupants: Omit<OccupantInput, "signatureNom" | "signatureImage">[]
) {
  await auth.protect();
  const db = getDb();

  const [form] = await db.select().from(gendarmerieForms).where(eq(gendarmerieForms.id, formId)).limit(1);
  if (!form) throw new Error("Formulaire introuvable.");

  const validOccupants = occupants.filter((o) => o.nom.trim() || o.prenom.trim());
  if (validOccupants.length === 0) throw new Error("Ajoute au moins un occupant.");

  const normalizedOccupants = await Promise.all(
    validOccupants.map(async (o) => ({
      ...o,
      photoPieceUrl: o.photoPieceUrl ? await normalizeIdPhotoDataUrl(o.photoPieceUrl) : o.photoPieceUrl,
    }))
  );

  await db.insert(gendarmerieOccupants).values(
    normalizedOccupants.map((o) => ({
      formId,
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
      photoPieceUrl: o.photoPieceUrl || null,
    }))
  );

  await db.update(gendarmerieForms).set({ statut: "attente_signature" }).where(eq(gendarmerieForms.id, formId));

  revalidatePath("/villas");
  revalidatePath(`/g/${formId}`);
}

// Volontairement sans auth.protect() : le client signe via le lien public /g/[id], sans se
// connecter. Ne touche qu'à la signature de chaque occupant déjà pré-rempli par le staff — les
// autres champs (nom, dates, pièce...) restent tels que saisis par Kamel depuis le passeport.
export async function signGendarmerieOccupants(
  formId: string,
  langue: string,
  signatures: { occupantId: string; signatureNom: string; signatureImage: string }[]
) {
  const db = getDb();

  const [form] = await db.select().from(gendarmerieForms).where(eq(gendarmerieForms.id, formId)).limit(1);
  if (!form) throw new Error("Formulaire introuvable.");

  const validSignatures = signatures.filter((s) => s.signatureNom.trim() && s.signatureImage);
  if (validSignatures.length === 0) throw new Error("Merci de signer avant d'envoyer.");

  for (const s of validSignatures) {
    await db
      .update(gendarmerieOccupants)
      .set({ signatureNom: s.signatureNom.trim(), signatureImage: s.signatureImage })
      .where(and(eq(gendarmerieOccupants.id, s.occupantId), eq(gendarmerieOccupants.formId, formId)));
  }

  await db
    .update(gendarmerieForms)
    .set({ statut: "complete", langue, completedAt: new Date() })
    .where(eq(gendarmerieForms.id, formId));

  revalidatePath("/villas");
  revalidatePath(`/g/${formId}`);
}

export async function deleteGendarmerieForm(formId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(gendarmerieForms).where(eq(gendarmerieForms.id, formId));
  revalidatePath("/villas");
}

// Correction manuelle de l'orientation d'une photo déjà enregistrée : la détection automatique
// du sens de rotation s'est révélée peu fiable (voir id-photo-normalize.ts) — c'est donc au
// staff de tourner à la main une photo repérée de travers sur la fiche.
export async function rotateOccupantPhoto(occupantId: string, degrees: 90 | -90) {
  await auth.protect();
  const db = getDb();

  const [occupant] = await db
    .select({ photoPieceUrl: gendarmerieOccupants.photoPieceUrl, formId: gendarmerieOccupants.formId })
    .from(gendarmerieOccupants)
    .where(eq(gendarmerieOccupants.id, occupantId))
    .limit(1);
  if (!occupant?.photoPieceUrl) throw new Error("Aucune photo à tourner.");

  const buffer = await loadImageBuffer(occupant.photoPieceUrl);
  if (!buffer) throw new Error("Photo introuvable ou inaccessible.");

  const rotatedBuffer = await sharp(buffer).rotate(degrees).toBuffer();
  const normalizedBuffer = await normalizeIdPhotoBuffer(rotatedBuffer);
  const photoPieceUrl = `data:image/jpeg;base64,${normalizedBuffer.toString("base64")}`;

  await db.update(gendarmerieOccupants).set({ photoPieceUrl }).where(eq(gendarmerieOccupants.id, occupantId));

  revalidatePath(`/gendarmerie/${occupant.formId}`);
  revalidatePath("/documents");
}

// Complète a posteriori la photo d'un occupant qui a signé sans en joindre une (le champ est
// facultatif dans le formulaire invité) — utilisé quand le staff récupère la pièce autrement
// (WhatsApp, etc.) après coup.
export async function setOccupantPhoto(occupantId: string, dataUrl: string) {
  await auth.protect();
  const db = getDb();

  const [occupant] = await db
    .select({ formId: gendarmerieOccupants.formId })
    .from(gendarmerieOccupants)
    .where(eq(gendarmerieOccupants.id, occupantId))
    .limit(1);
  if (!occupant) throw new Error("Occupant introuvable.");

  const photoPieceUrl = await normalizeIdPhotoDataUrl(dataUrl);
  await db.update(gendarmerieOccupants).set({ photoPieceUrl }).where(eq(gendarmerieOccupants.id, occupantId));

  revalidatePath(`/gendarmerie/${occupant.formId}`);
  revalidatePath("/documents");
}
