"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { estMembreEquipe } from "@/lib/acces";
import { synchroniserAvis, type ResultatSyncAvis } from "@/lib/avis/sync";

// Bouton « Actualiser » de l'onglet Avis : même synchro que le cron quotidien.
export async function actualiserAvis(): Promise<ResultatSyncAvis> {
  const { userId } = await auth.protect();
  if (!(await estMembreEquipe(userId))) throw new Error("Accès refusé.");
  const resultat = await synchroniserAvis();
  revalidatePath("/avis");
  return resultat;
}
