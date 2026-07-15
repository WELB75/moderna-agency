"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cashEntries } from "@/db/schema";

export async function createCashEntry(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const type = String(formData.get("type") ?? "");
  const montant = String(formData.get("montant") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const responsable = String(formData.get("responsable") ?? "").trim() || null;

  if (!["remise", "depense", "restitution"].includes(type)) {
    throw new Error("Type de mouvement invalide.");
  }
  const montantNum = Number(montant.replace(",", "."));
  if (!montantNum || montantNum <= 0) {
    throw new Error("Le montant doit être un nombre positif.");
  }

  const db = getDb();
  await db.insert(cashEntries).values({
    villaId,
    type: type as "remise" | "depense" | "restitution",
    montant: montantNum.toFixed(2),
    description: description || null,
    responsable,
    createdByUserId: user?.id ?? "inconnu",
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/caisse");
}

export async function deleteCashEntry(entryId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(cashEntries).where(eq(cashEntries.id, entryId));
  revalidatePath("/caisse");
}
