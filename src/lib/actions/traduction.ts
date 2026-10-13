"use server";

import { auth } from "@clerk/nextjs/server";
import { traduireVersFrancais, traduireVersLangue, type TraductionRecue } from "@/lib/translate-ai";

const MAX_MESSAGES = 40;
const MAX_CHARS = 4000;

export async function traduireMessagesRecus(textes: string[]): Promise<TraductionRecue[]> {
  await auth.protect();
  const propres = textes.slice(0, MAX_MESSAGES).map((t) => String(t).slice(0, MAX_CHARS));
  return traduireVersFrancais(propres);
}

export async function traduireReponse(texte: string, langue: string): Promise<string> {
  await auth.protect();
  const t = String(texte).trim().slice(0, MAX_CHARS);
  if (!t) throw new Error("Le message ne peut pas être vide.");
  return traduireVersLangue(t, String(langue).slice(0, 40));
}
