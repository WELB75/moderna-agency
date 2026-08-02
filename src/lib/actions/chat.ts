"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { chatMessages } from "@/db/schema";

export type ChatCategorie =
  | "menage_cuisine"
  | "reservations"
  | "maintenance"
  | "caisse"
  | "securite_documents"
  | "urgent"
  | "general";

export async function postChatMessage(categorie: ChatCategorie, message: string, villaId: string | null) {
  await auth.protect();
  const user = await currentUser();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  await db.insert(chatMessages).values({
    categorie,
    villaId,
    message: trimmed,
    createdByUserId: user?.id ?? "inconnu",
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/chat");
}

// Réponse à un message précis, à tout moment (pas seulement dans la foulée) — hérite de la
// catégorie et de la villa du message d'origine, pas besoin de les ressaisir.
export async function replyToChatMessage(parentId: string, message: string) {
  await auth.protect();
  const user = await currentUser();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message est vide.");

  const db = getDb();
  const [parent] = await db.select().from(chatMessages).where(eq(chatMessages.id, parentId)).limit(1);
  if (!parent) throw new Error("Message d'origine introuvable.");

  await db.insert(chatMessages).values({
    categorie: parent.categorie,
    villaId: parent.villaId,
    parentId: parent.id,
    message: trimmed,
    createdByUserId: user?.id ?? "inconnu",
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/chat");
}

// Un message reste visible comme "à traiter" tant qu'il n'est pas explicitement marqué —
// c'est ce qui donne le vrai suivi (contrairement à un chat classique où tout se noie une fois
// défilé) : un changement de personnel annoncé par Imane reste signalé jusqu'à confirmation.
export async function toggleChatMessageTraite(id: string, traite: boolean) {
  await auth.protect();
  const user = await currentUser();
  const db = getDb();
  await db
    .update(chatMessages)
    .set({
      traite,
      traiteAt: traite ? new Date() : null,
      traitePar: traite ? (user?.fullName ?? user?.username ?? "Équipe") : null,
    })
    .where(eq(chatMessages.id, id));

  revalidatePath("/chat");
}

export async function deleteChatMessage(id: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(chatMessages).where(eq(chatMessages.id, id));
  revalidatePath("/chat");
}

// Compte des messages pas encore marqués "traité", tous domaines/catégories confondus — affiché
// en bulle sur "Messages" dans la navigation et sur la tuile Accueil, pour voir en un coup d'œil
// qu'il y a du nouveau sans devoir ouvrir la page.
export async function getUnreadChatCount(): Promise<number> {
  await auth.protect();
  const db = getDb();
  const rows = await db.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.traite, false));
  return rows.length;
}
