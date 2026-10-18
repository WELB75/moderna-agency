"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryChecklists, inventoryItems, checklistItemTemplates, villas } from "@/db/schema";
import { tracer } from "@/lib/journal";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/inventory-defaults";
import { compareChecklistWithEntree } from "@/lib/damage-comparison-ai";

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

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({
    categorie: "inventaire",
    action: "etat_des_lieux_cree",
    libelle: "État des lieux créé",
    resume: `${type === "entree" ? "Entrée" : "Sortie"}${villa ? ` - ${villa.nom}` : ""}`,
    villaId,
    villaNom: villa?.nom ?? null,
    reservationId,
  });

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

  const [cl] = await db
    .select({ type: inventoryChecklists.type, villaId: inventoryChecklists.villaId, reservationId: inventoryChecklists.reservationId, villaNom: villas.nom })
    .from(inventoryChecklists)
    .leftJoin(villas, eq(villas.id, inventoryChecklists.villaId))
    .where(eq(inventoryChecklists.id, input.checklistId))
    .limit(1);
  await tracer({
    categorie: "inventaire",
    action: "etat_des_lieux_signe",
    libelle: "État des lieux finalisé et signé",
    resume: `${cl ? (cl.type === "entree" ? "Entrée" : "Sortie") : "État des lieux"} - client : ${input.clientNom.trim()}${cl?.villaNom ? ` - ${cl.villaNom}` : ""}`,
    villaId: cl?.villaId ?? null,
    villaNom: cl?.villaNom ?? null,
    reservationId: cl?.reservationId ?? null,
  });

  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${input.checklistId}`);
}

export async function runDamageComparison(checklistId: string) {
  await auth.protect();
  const result = await compareChecklistWithEntree(checklistId);
  revalidatePath(`/inventaire/${checklistId}`);
  return result;
}

export async function updateItemClassification(
  itemId: string,
  classification: "a_definir" | "usure_normale" | "degat_facturable" | "a_arbitrer_moderna"
) {
  await auth.protect();
  const db = getDb();
  const [item] = await db.select({ libelle: inventoryItems.libelle }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  await db.update(inventoryItems).set({ usureClassification: classification }).where(eq(inventoryItems.id, itemId));
  await tracer({
    categorie: "inventaire",
    action: "degat_classification",
    libelle: "Classification d'un dégât modifiée",
    resume: `${item?.libelle ?? "Élément"} : ${classification}`,
  });
}

export async function updateItemPriseEnCharge(
  itemId: string,
  priseEnCharge: "a_definir" | "proprietaire" | "moderna" | "locataire"
) {
  await auth.protect();
  const db = getDb();
  const [item] = await db.select({ libelle: inventoryItems.libelle }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  await db.update(inventoryItems).set({ priseEnCharge }).where(eq(inventoryItems.id, itemId));
  await tracer({
    categorie: "inventaire",
    action: "degat_prise_en_charge",
    libelle: "Prise en charge d'un dégât modifiée",
    resume: `${item?.libelle ?? "Élément"} : ${priseEnCharge}`,
  });
}

export async function updateItemMontantEstime(itemId: string, montant: string) {
  await auth.protect();
  const db = getDb();
  const [item] = await db.select({ libelle: inventoryItems.libelle }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  await db
    .update(inventoryItems)
    .set({ montantEstime: montant.trim() || null })
    .where(eq(inventoryItems.id, itemId));
  await tracer({
    categorie: "inventaire",
    action: "degat_montant",
    libelle: "Montant estimé d'un dégât modifié",
    resume: `${item?.libelle ?? "Élément"} : ${montant.trim() || "aucun montant"}`,
  });
}

export async function deleteChecklist(checklistId: string) {
  await auth.protect();
  const db = getDb();
  const [avant] = await db
    .select({ type: inventoryChecklists.type, villaId: inventoryChecklists.villaId, villaNom: villas.nom })
    .from(inventoryChecklists)
    .leftJoin(villas, eq(villas.id, inventoryChecklists.villaId))
    .where(eq(inventoryChecklists.id, checklistId))
    .limit(1);
  await db.delete(inventoryChecklists).where(eq(inventoryChecklists.id, checklistId));
  await tracer({
    categorie: "inventaire",
    action: "etat_des_lieux_supprime",
    libelle: "État des lieux supprimé",
    resume: avant ? `${avant.type === "entree" ? "Entrée" : "Sortie"}${avant.villaNom ? ` - ${avant.villaNom}` : ""}` : null,
    villaId: avant?.villaId ?? null,
    villaNom: avant?.villaNom ?? null,
  });
  revalidatePath("/inventaire");
}
