"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql as rawSql } from "drizzle-orm";
import { getDb } from "@/db";
import { products, receipts, receiptItems, domaineStock, villaStock } from "@/db/schema";

export async function createProduct(nom: string) {
  await auth.protect();
  const trimmed = nom.trim();
  if (!trimmed) throw new Error("Le nom du produit est obligatoire.");

  const db = getDb();
  const existing = await db.select().from(products).where(eq(products.nom, trimmed));
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(products).values({ nom: trimmed }).returning();
  revalidatePath("/courses");
  return created;
}

export async function createReceipt(input: {
  photoUrl: string;
  domaineId: string | null;
  montant: number | null;
  notes: string | null;
  items: { productId: string; quantite: number }[];
}) {
  await auth.protect();
  const user = await currentUser();

  if (!input.photoUrl) throw new Error("La photo du reçu est obligatoire.");

  const db = getDb();
  const [receipt] = await db
    .insert(receipts)
    .values({
      photoUrl: input.photoUrl,
      domaineId: input.domaineId,
      montant: input.montant != null ? input.montant.toFixed(2) : null,
      notes: input.notes,
      createdByUserId: user?.id ?? "inconnu",
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  const validItems = input.items.filter((i) => i.productId && i.quantite > 0);

  if (validItems.length > 0) {
    await db.insert(receiptItems).values(
      validItems.map((i) => ({
        receiptId: receipt.id,
        productId: i.productId,
        quantite: i.quantite,
      }))
    );

    if (input.domaineId) {
      for (const item of validItems) {
        await db
          .insert(domaineStock)
          .values({ domaineId: input.domaineId, productId: item.productId, quantite: item.quantite })
          .onConflictDoUpdate({
            target: [domaineStock.domaineId, domaineStock.productId],
            set: {
              quantite: rawSql`${domaineStock.quantite} + ${item.quantite}`,
              updatedAt: new Date(),
            },
          });
      }
    }
  }

  revalidatePath("/courses");
}

export async function deleteReceipt(receiptId: string) {
  await auth.protect();
  const db = getDb();

  const receiptRows = await db.select().from(receipts).where(eq(receipts.id, receiptId));
  const receipt = receiptRows[0];
  if (!receipt) return;

  if (receipt.domaineId) {
    const items = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, receiptId));
    for (const item of items) {
      await db
        .update(domaineStock)
        .set({ quantite: rawSql`GREATEST(${domaineStock.quantite} - ${item.quantite}, 0)`, updatedAt: new Date() })
        .where(and(eq(domaineStock.domaineId, receipt.domaineId), eq(domaineStock.productId, item.productId)));
    }
  }

  await db.delete(receipts).where(eq(receipts.id, receiptId));
  revalidatePath("/courses");
}

export async function setDomaineStock(domaineId: string, productId: string, quantite: number) {
  await auth.protect();
  if (quantite < 0) throw new Error("La quantité ne peut pas être négative.");

  const db = getDb();
  await db
    .insert(domaineStock)
    .values({ domaineId, productId, quantite })
    .onConflictDoUpdate({
      target: [domaineStock.domaineId, domaineStock.productId],
      set: { quantite, updatedAt: new Date() },
    });

  revalidatePath("/courses");
}

export async function setVillaStock(villaId: string, productId: string, quantite: number) {
  await auth.protect();
  if (quantite < 0) throw new Error("La quantité ne peut pas être négative.");

  const db = getDb();
  await db
    .insert(villaStock)
    .values({ villaId, productId, quantite })
    .onConflictDoUpdate({
      target: [villaStock.villaId, villaStock.productId],
      set: { quantite, updatedAt: new Date() },
    });

  revalidatePath("/courses");
}
