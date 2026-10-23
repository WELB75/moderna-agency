"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservationJournal } from "@/db/schema-journal";
import { assurerTableJournal, peutSupprimerJournal } from "@/lib/journal";

// Supprime une ligne du journal. Réservé à Kamel (voir peutSupprimerJournal) : le contrôle est
// refait ici, côté serveur, indépendamment de l'affichage du bouton. Volontairement sans nouvelle
// trace dans le journal : le but est justement de pouvoir retirer des lignes.
export async function supprimerEntreeJournal(id: string): Promise<void> {
  await auth.protect();
  if (!(await peutSupprimerJournal())) throw new Error("Seul Kamel peut supprimer des lignes du journal.");
  await assurerTableJournal();
  await getDb().delete(reservationJournal).where(eq(reservationJournal.id, id));
  revalidatePath("/journal");
}
