"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dailyTasks } from "@/db/schema";
import { tracer } from "@/lib/journal";

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
  await tracer({ categorie: "autre", action: "tache_creee", libelle: "Tâche du jour créée", resume: `${titre} (pour ${assigne})` });

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
  const [t] = await db.select({ titre: dailyTasks.titre }).from(dailyTasks).where(eq(dailyTasks.id, taskId)).limit(1);
  await db.delete(dailyTasks).where(eq(dailyTasks.id, taskId));
  await tracer({ categorie: "autre", action: "tache_supprimee", libelle: "Tâche du jour supprimée", resume: t?.titre ?? null });
  revalidatePath("/a-faire");
}
