"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villas } from "@/db/schema";

export async function regenerateGuestToken(villaId: string) {
  await auth.protect();
  const db = getDb();
  const [updated] = await db
    .update(villas)
    .set({ lienClientToken: sql`gen_random_uuid()` })
    .where(eq(villas.id, villaId))
    .returning({ lienClientToken: villas.lienClientToken });

  revalidatePath(`/villas/${villaId}`);
  return updated;
}
