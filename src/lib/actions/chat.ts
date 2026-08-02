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
