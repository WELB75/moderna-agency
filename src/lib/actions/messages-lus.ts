"use server";

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { inboxReads } from "@/db/schema-recaps";

// Marque une conversation de la boîte de réception comme lue (ouverte) : la pastille "Messages"
// du menu descend d'un cran. N'envoie rien, ne répond à personne.
export async function marquerConversationLue(convKey: string): Promise<void> {
  await auth.protect();
  const cle = convKey.trim();
  if (!cle || cle.length > 200) return;
  await getDb()
    .insert(inboxReads)
    .values({ convKey: cle, readAt: new Date() })
    .onConflictDoUpdate({ target: inboxReads.convKey, set: { readAt: new Date() } });
}
