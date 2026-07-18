"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql as rawSql } from "drizzle-orm";
import { getDb } from "@/db";
import { products, receipts, receiptItems, domaineStock, villaStock, domaines, villas } from "@/db/schema";

async function getBaseDomaine(db: ReturnType<typeof getDb>) {
  const [base] = await db.select().from(domaines).where(eq(domaines.estBase, true)).limit(1);
  return base ?? null;
}

async function getDomaineStockQuantite(db: ReturnType<typeof getDb>, domaineId: string, productId: string) {
  const [row] = await db
    .select({ quantite: domaineStock.quantite })
    .from(domaineStock)
    .where(and(eq(domaineStock.domaineId, domaineId), eq(domaineStock.productId, productId)))
    .limit(1);
  return row?.quantite ?? 0;
}

async function getVillaStockQuantite(db: ReturnType<typeof getDb>, villaId: string, productId: string) {
  const [row] = await db
    .select({ quantite: villaStock.quantite })
    .from(villaStock)
    .where(and(eq(villaStock.villaId, villaId), eq(villaStock.productId, productId)))
    .limit(1);
  return row?.quantite ?? 0;
}

async function withdrawFromBase(
  db: ReturnType<typeof getDb>,
  productId: string,
  qty: number,
  productNom: string
) {
  const base = await getBaseDomaine(db);
  if (!base) throw new Error("Aucun stock de base (Bureau) configuré.");

  const baseQty = await getDomaineStockQuantite(db, base.id, productId);
  if (baseQty < qty) {
    throw new Error(`Stock insuffisant à la base pour "${productNom}" (${baseQty} disponible(s)).`);
  }

  await db
    .update(domaineStock)
    .set({ quantite: baseQty - qty, updatedAt: new Date() })
    .where(and(eq(domaineStock.domaineId, base.id), eq(domaineStock.productId, productId)));
}

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
  const [domaine] = await db.select().from(domaines).where(eq(domaines.id, domaineId)).limit(1);
  if (!domaine) throw new Error("Domaine introuvable.");

  // Transfert automatique : augmenter le stock d'un domaine (hors base) retire la
  // même quantité du stock de base (Bureau), pour ne pas compter le produit deux fois.
  if (!domaine.estBase) {
    const oldQty = await getDomaineStockQuantite(db, domaineId, productId);
    const delta = quantite - oldQty;
    if (delta > 0) {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      await withdrawFromBase(db, productId, delta, product?.nom ?? "ce produit");
    }
  }

  await db
    .insert(domaineStock)
    .values({ domaineId, productId, quantite })
    .onConflictDoUpdate({
      target: [domaineStock.domaineId, domaineStock.productId],
      set: { quantite, updatedAt: new Date() },
    });

  revalidatePath("/courses");
  revalidatePath("/inventaire");
}

export async function setVillaStock(villaId: string, productId: string, quantite: number) {
  await auth.protect();
  if (quantite < 0) throw new Error("La quantité ne peut pas être négative.");

  const db = getDb();
  const [villa] = await db.select().from(villas).where(eq(villas.id, villaId)).limit(1);
  if (!villa) throw new Error("Villa introuvable.");

  // Transfert automatique : augmenter le stock d'une villa retire la même quantité
  // du stock de son domaine (ou de la base si la villa n'a pas de domaine).
  const oldQty = await getVillaStockQuantite(db, villaId, productId);
  const delta = quantite - oldQty;
  if (delta > 0) {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (villa.domaineId) {
      const domaineQty = await getDomaineStockQuantite(db, villa.domaineId, productId);
      if (domaineQty < delta) {
        throw new Error(`Stock insuffisant dans le domaine pour "${product?.nom ?? "ce produit"}" (${domaineQty} disponible(s)).`);
      }
      await db
        .update(domaineStock)
        .set({ quantite: domaineQty - delta, updatedAt: new Date() })
        .where(and(eq(domaineStock.domaineId, villa.domaineId), eq(domaineStock.productId, productId)));
    } else {
      await withdrawFromBase(db, productId, delta, product?.nom ?? "ce produit");
    }
  }

  await db
    .insert(villaStock)
    .values({ villaId, productId, quantite })
    .onConflictDoUpdate({
      target: [villaStock.villaId, villaStock.productId],
      set: { quantite, updatedAt: new Date() },
    });

  revalidatePath("/courses");
  revalidatePath("/inventaire");
}
