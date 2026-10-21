"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { envoyerDepuisAgence } from "@/lib/whatsapp-agence";

// Répondre à un client depuis la boîte Messages, via la ligne WhatsApp Business de l'agence.
// Le numéro n'est accepté que s'il a déjà écrit sur cette ligne (vérifié dans envoyerDepuisAgence).
export async function repondreWhatsAppAgence(contact: string, message: string) {
  await auth.protect();
  const texte = message.trim();
  if (!texte) throw new Error("Le message ne peut pas être vide.");
  if (texte.length > 4000) throw new Error("Message trop long.");
  await envoyerDepuisAgence(contact, texte);
  revalidatePath("/chat");
}
