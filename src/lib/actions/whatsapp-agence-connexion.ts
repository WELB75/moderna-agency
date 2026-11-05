"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { statutAcces } from "@/lib/acces";
import { connecterLigneAgence, relancerSynchroAgence, type ResultatConnexion } from "@/lib/whatsapp-agence-connexion";

async function exigerAdmin(): Promise<string | null> {
  const { userId } = await auth.protect();
  const moi = await statutAcces(userId);
  if (moi.role !== "admin") throw new Error("Réservé aux administrateurs.");
  return moi.email ?? moi.nom ?? null;
}

// Fin du parcours Meta (scan du QR code avec WhatsApp Business) : on enregistre la ligne agence.
export async function enregistrerConnexionWhatsAppAgence(input: {
  code: string | null;
  phoneNumberId: string;
  wabaId: string | null;
}): Promise<ResultatConnexion> {
  const par = await exigerAdmin();
  const resultat = await connecterLigneAgence({ ...input, par });
  revalidatePath("/acces/whatsapp");
  revalidatePath("/chat");
  return resultat;
}

export async function relancerImportHistoriqueAgence(): Promise<{ erreur: string | null }> {
  await exigerAdmin();
  const erreur = await relancerSynchroAgence();
  revalidatePath("/acces/whatsapp");
  return { erreur };
}
