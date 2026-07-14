"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { procedureTemplates } from "@/db/schema";

async function getSteps(procedureId: string) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(procedureTemplates)
    .where(eq(procedureTemplates.id, procedureId))
    .limit(1);
  if (!record) throw new Error("Procédure introuvable.");
  return { db, steps: [...(record.etapes ?? [])] };
}

export async function addProcedureStep(procedureId: string, step: string) {
  await auth.protect();
  const trimmed = step.trim();
  if (!trimmed) return;

  const { db, steps } = await getSteps(procedureId);
  steps.push(trimmed);
  await db
    .update(procedureTemplates)
    .set({ etapes: steps, updatedAt: new Date() })
    .where(eq(procedureTemplates.id, procedureId));

  revalidatePath("/inventaire");
}

export async function removeProcedureStep(procedureId: string, index: number) {
  await auth.protect();
  const { db, steps } = await getSteps(procedureId);
  steps.splice(index, 1);
  await db
    .update(procedureTemplates)
    .set({ etapes: steps, updatedAt: new Date() })
    .where(eq(procedureTemplates.id, procedureId));

  revalidatePath("/inventaire");
}

export async function moveProcedureStep(procedureId: string, index: number, direction: "up" | "down") {
  await auth.protect();
  const { db, steps } = await getSteps(procedureId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= steps.length) return;
  [steps[index], steps[target]] = [steps[target], steps[index]];
  await db
    .update(procedureTemplates)
    .set({ etapes: steps, updatedAt: new Date() })
    .where(eq(procedureTemplates.id, procedureId));

  revalidatePath("/inventaire");
}
