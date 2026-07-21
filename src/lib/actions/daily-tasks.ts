"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyTasks } from "@/db/schema";

export async function createDailyTask(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const titre = String(formData.get("titre") ?? "").trim();
  if (!titre) throw new Error("Le titre de la tâche est obligatoire.");
  const assigne = String(formData.get("assigne") ?? "kamel").trim() || "kamel";

  const db = getDb();
  await db.insert(dailyTasks).values({
    titre,
    assigne,
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/a-faire");
}

export async function toggleDailyTask(taskId: string, fait: boolean) {
  await auth.protect();
  const db = getDb();
  await db
    .update(dailyTasks)
    .set({ fait, completedAt: fait ? new Date() : null })
    .where(eq(dailyTasks.id, taskId));
  revalidatePath("/a-faire");
}

export async function deleteDailyTask(taskId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(dailyTasks).where(eq(dailyTasks.id, taskId));
  revalidatePath("/a-faire");
}
