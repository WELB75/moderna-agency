"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { interventions } from "@/db/schema";
import type { Devis } from "@/lib/devis-types";

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
    origine: "staff",
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Volontairement sans auth.protect() : le propriétaire crée une demande de travaux
// depuis son lien public /p/[token], sans connexion. Portée limitée à sa propre villa
// (villaId déjà connu via le token, pas saisi par l'utilisateur).
export async function createInterventionByOwner(villaId: string, titre: string, probleme: string) {
  const trimmedTitre = titre.trim();
  if (!trimmedTitre) throw new Error("Le titre est obligatoire.");

  const db = getDb();
  await db.insert(interventions).values({
    titre: trimmedTitre,
    probleme: probleme.trim() || null,
    villaId,
    origine: "proprietaire",
    createdByName: "Propriétaire",
  });

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
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
  revalidatePath("/maintenance");
}

export async function updateInterventionNotes(interventionId: string, notes: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(interventions)
    .set({ notes: notes || null, updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function addInterventionAttachments(interventionId: string, urls: string[]) {
  await auth.protect();
  const db = getDb();
  const [existing] = await db.select().from(interventions).where(eq(interventions.id, interventionId)).limit(1);
  if (!existing) throw new Error("Intervention introuvable.");

  await db
    .update(interventions)
    .set({ attachmentUrls: [...(existing.attachmentUrls ?? []), ...urls], updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function updateInterventionLieu(interventionId: string, lieu: string) {
  await auth.protect();
  const db = getDb();
  await db
    .update(interventions)
    .set({ lieu: lieu || null, updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function deleteIntervention(interventionId: string) {
  await auth.protect();
  const db = getDb();
  await db.delete(interventions).where(eq(interventions.id, interventionId));
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function addDevis(interventionId: string, devis: Devis) {
  await auth.protect();
  const db = getDb();
  const [current] = await db
    .select({ devis: interventions.devis })
    .from(interventions)
    .where(eq(interventions.id, interventionId))
    .limit(1);
  if (!current) throw new Error("Intervention introuvable.");

  await db
    .update(interventions)
    .set({ devis: [...(current.devis ?? []), devis], updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath(`/i/${interventionId}`);
}

export async function deleteDevis(interventionId: string, index: number) {
  await auth.protect();
  const db = getDb();
  const [current] = await db
    .select({ devis: interventions.devis })
    .from(interventions)
    .where(eq(interventions.id, interventionId))
    .limit(1);
  if (!current) throw new Error("Intervention introuvable.");

  await db
    .update(interventions)
    .set({ devis: (current.devis ?? []).filter((_, i) => i !== index), updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath(`/i/${interventionId}`);
}

// Volontairement sans auth.protect() : Imed Jaiel valide via le lien public /i/[id],
// sans se connecter. La portée est limitée à ces deux champs sur une intervention
// dont il faut déjà connaître l'identifiant (le lien partagé).
export async function submitInterventionValidation(
  interventionId: string,
  statut: "accepte" | "refuse",
  note: string
) {
  if (statut !== "accepte" && statut !== "refuse") throw new Error("Statut invalide.");

  const db = getDb();
  await db
    .update(interventions)
    .set({
      validationStatut: statut,
      validationNote: note.trim() || null,
      validationAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath(`/i/${interventionId}`);
}
