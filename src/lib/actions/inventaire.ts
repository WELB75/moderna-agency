"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryChecklists, inventoryItems, checklistItemTemplates } from "@/db/schema";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/inventory-defaults";

export async function createChecklist(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "");
  const type = String(formData.get("type") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "").trim() || null;

  if (!villaId || (type !== "entree" && type !== "sortie")) {
    throw new Error("Villa et type d'état des lieux obligatoires.");
  }

  const db = getDb();

  const [checklist] = await db
    .insert(inventoryChecklists)
    .values({
      villaId,
      reservationId,
      type,
      agentUserId: user?.id ?? null,
      agentNom: user?.fullName ?? user?.username ?? null,
    })
    .returning();

  const templates = await db
    .select()
    .from(checklistItemTemplates)
    .where(eq(checklistItemTemplates.villaId, villaId));

  const itemSource =
    templates.length > 0
      ? templates.map((t) => ({ categorie: t.categorie, libelle: t.libelle }))
      : DEFAULT_CHECKLIST_ITEMS;

  await db.insert(inventoryItems).values(
    itemSource.map((item, index) => ({
      checklistId: checklist.id,
      categorie: item.categorie,
      libelle: item.libelle,
      ordre: index,
    }))
  );

  revalidatePath("/inventaire");
  return checklist.id;
}

export async function updateItemStatus(itemId: string, status: "ok" | "probleme" | "non_verifie") {
  await auth.protect();
  const db = getDb();
  await db.update(inventoryItems).set({ status }).where(eq(inventoryItems.id, itemId));
}

export async function updateItemComment(itemId: string, commentaire: string) {
  await auth.protect();
  const db = getDb();
  await db.update(inventoryItems).set({ commentaire: commentaire || null }).where(eq(inventoryItems.id, itemId));
}

export async function addItemPhoto(itemId: string, url: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(inventoryItems)
    .set({ photoUrls: sql`coalesce(${inventoryItems.photoUrls}, '[]'::jsonb) || ${JSON.stringify([url])}::jsonb` })
    .where(eq(inventoryItems.id, itemId));
}

export async function removeItemPhoto(itemId: string, url: string) {
  await auth.protect();
  const db = getDb();
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  if (!item) return;
  const next = (item.photoUrls ?? []).filter((u) => u !== url);
  await db.update(inventoryItems).set({ photoUrls: next }).where(eq(inventoryItems.id, itemId));
}

export async function updateChecklistNotes(checklistId: string, notesGenerales: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(inventoryChecklists)
    .set({ notesGenerales: notesGenerales || null, updatedAt: new Date() })
    .where(eq(inventoryChecklists.id, checklistId));
}

export async function finalizeChecklist(input: {
  checklistId: string;
  clientNom: string;
  clientSignatureUrl: string;
  agentSignatureUrl: string;
}) {
  await auth.protect();

  if (!input.clientNom.trim() || !input.clientSignatureUrl || !input.agentSignatureUrl) {
    throw new Error("Le nom du client et les deux signatures sont obligatoires.");
  }

  const db = getDb();
  await db
    .update(inventoryChecklists)
    .set({
      clientNom: input.clientNom.trim(),
      clientSignatureUrl: input.clientSignatureUrl,
      agentSignatureUrl: input.agentSignatureUrl,
      status: "signe",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(inventoryChecklists.id, input.checklistId));

  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${input.checklistId}`);
}

export async function deleteChecklist(checklistId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(inventoryChecklists).where(eq(inventoryChecklists.id, checklistId));
  revalidatePath("/inventaire");
}
