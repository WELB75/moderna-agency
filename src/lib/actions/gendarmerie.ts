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

// Volontairement sans auth.protect() : le client remplit via le lien public /g/[id],
// sans se connecter.
export async function submitGendarmerieOccupants(formId: string, langue: string, occupants: OccupantInput[]) {
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
    }))
  );

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
