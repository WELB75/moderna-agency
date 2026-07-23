"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gendarmerieForms, gendarmerieOccupants } from "@/db/schema";

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

  await db.insert(gendarmerieOccupants).values(
    validOccupants.map((o) => ({
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
    .set({ statut: "complete", langue, enfantsPassportUrls, completedAt: new Date() })
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
