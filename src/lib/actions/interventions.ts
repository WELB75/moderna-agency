"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interventions } from "@/db/schema";

const ETAPES = ["signale", "contacte", "planifie", "en_cours", "termine"] as const;
type Etape = (typeof ETAPES)[number];

const ETAPE_TIMESTAMP_FIELD: Record<Etape, "signaleAt" | "contacteAt" | "planifieAt" | "debutAt" | "finAt"> = {
  signale: "signaleAt",
  contacte: "contacteAt",
  planifie: "planifieAt",
  en_cours: "debutAt",
  termine: "finAt",
};

export async function createIntervention(formData: FormData) {
  await auth.protect();
  const user = await currentUser();

  const titre = String(formData.get("titre") ?? "").trim();
  const probleme = String(formData.get("probleme") ?? "").trim();
  const lieu = String(formData.get("lieu") ?? "").trim();
  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const domaineId = String(formData.get("domaineId") ?? "").trim() || null;
  const prestataire = String(formData.get("prestataire") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!titre) throw new Error("Le titre est obligatoire.");

  const db = getDb();
  await db.insert(interventions).values({
    titre,
    probleme: probleme || null,
    lieu: lieu || null,
    villaId,
    domaineId,
    prestataire: prestataire || null,
    notes: notes || null,
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/interventions");
}

export async function setInterventionEtape(interventionId: string, etape: Etape) {
  await auth.protect();
  if (!ETAPES.includes(etape)) throw new Error("Étape invalide.");

  const db = getDb();
  const timestampField = ETAPE_TIMESTAMP_FIELD[etape];

  await db
    .update(interventions)
    .set({ etape, [timestampField]: new Date(), updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
}

export async function updateInterventionNotes(interventionId: string, notes: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(interventions)
    .set({ notes: notes || null, updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));
  revalidatePath("/interventions");
}

export async function deleteIntervention(interventionId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(interventions).where(eq(interventions.id, interventionId));
  revalidatePath("/interventions");
}
