"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { interventions, technicians, villas } from "@/db/schema";
import type { Devis } from "@/lib/devis-types";
import type { Urgence } from "@/lib/intervention-urgence";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { notifyStaffWhatsApp, notifyPhoneWhatsApp } from "@/lib/whatsapp";
import { initiateMaintenanceRequest } from "@/lib/maintenance-ai";

// Dès qu'un problème décrit ET au moins une photo sont réunis sur une intervention SANS
// technicien déjà choisi à la main, on laisse l'IA proposer elle-même le technicien le plus
// pertinent (voir maintenance-ai.ts) plutôt que d'attendre que Kamel en assigne un — Kamel,
// 2026-08-18. initiateMaintenanceRequest est déjà idempotent (ne fait rien si une conversation
// existe déjà pour cette intervention), donc sûr à appeler à chaque fois que l'un des deux
// éléments arrive (problème à la création, photo ajoutée après, ou l'inverse).
async function maybeAutoDispatchMaintenance(interventionId: string) {
  const db = getDb();
  const [row] = await db
    .select({ probleme: interventions.probleme, attachmentUrls: interventions.attachmentUrls, technicianId: interventions.technicianId })
    .from(interventions)
    .where(eq(interventions.id, interventionId))
    .limit(1);
  if (!row) return;
  if (row.technicianId) return; // technicien déjà choisi à la main : pas de dispatch IA
  if (!row.probleme?.trim() || (row.attachmentUrls?.length ?? 0) === 0) return;

  try {
    await initiateMaintenanceRequest(interventionId);
  } catch (err) {
    console.error("Échec dispatch IA maintenance:", err);
  }
}

const ETAPES = ["signale", "contacte", "planifie", "en_cours", "termine"] as const;
type Etape = (typeof ETAPES)[number];

const URGENCES = ["basse", "normale", "haute", "critique"] as const;
const CATEGORIE_KEYS = CATEGORIES.map((c) => c.key);

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
  const technicianId = String(formData.get("technicianId") ?? "").trim() || null;
  const urgenceRaw = String(formData.get("urgence") ?? "normale").trim();
  const urgence = (URGENCES as readonly string[]).includes(urgenceRaw) ? (urgenceRaw as Urgence) : "normale";
  const categorieRaw = String(formData.get("categorie") ?? "autre").trim();
  const categorie = (CATEGORIE_KEYS as string[]).includes(categorieRaw) ? (categorieRaw as Categorie) : "autre";

  if (!titre) throw new Error("Le titre est obligatoire.");

  const db = getDb();
  const [created] = await db
    .insert(interventions)
    .values({
      titre,
      probleme: probleme || null,
      lieu: lieu || null,
      villaId,
      domaineId,
      prestataire: prestataire || null,
      technicianId,
      urgence,
      categorie,
      notes: notes || null,
      origine: "staff",
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning({ id: interventions.id });

  if (technicianId) {
    await notifyTechnicianAssignment(technicianId, titre);
  } else {
    await maybeAutoDispatchMaintenance(created.id);
  }

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Volontairement sans auth.protect() : le propriétaire crée une demande de travaux
// depuis son lien public /p/[token], sans connexion. Portée limitée à sa propre villa
// (villaId déjà connu via le token, pas saisi par l'utilisateur).
export async function createInterventionByOwner(
  villaId: string,
  titre: string,
  probleme: string,
  urgence: Urgence = "normale",
  categorie: Categorie = "autre"
) {
  const trimmedTitre = titre.trim();
  if (!trimmedTitre) throw new Error("Le titre est obligatoire.");
  const safeUrgence = (URGENCES as readonly string[]).includes(urgence) ? urgence : "normale";
  const safeCategorie = (CATEGORIE_KEYS as string[]).includes(categorie) ? categorie : "autre";

  const db = getDb();
  await db.insert(interventions).values({
    titre: trimmedTitre,
    probleme: probleme.trim() || null,
    villaId,
    urgence: safeUrgence,
    categorie: safeCategorie,
    origine: "proprietaire",
    createdByName: "Propriétaire",
  });

  if (safeUrgence === "critique") {
    const [villa] = await db
      .select({ nom: villas.nom, numero: villas.numero })
      .from(villas)
      .where(eq(villas.id, villaId))
      .limit(1);
    await notifyStaffWhatsApp(
      `Demande TRÈS URGENTE du propriétaire : "${trimmedTitre}"${villa ? ` — ${villa.nom} (n°${villa.numero})` : ""}.`
    );
  }

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

async function notifyTechnicianAssignment(technicianId: string, titre: string) {
  const db = getDb();
  const [tech] = await db
    .select({ telephone: technicians.telephone, accessToken: technicians.accessToken, nom: technicians.nom })
    .from(technicians)
    .where(eq(technicians.id, technicianId))
    .limit(1);
  if (!tech) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = baseUrl ? `${baseUrl}/t/${tech.accessToken}` : `/t/${tech.accessToken}`;
  await notifyPhoneWhatsApp(
    tech.telephone,
    `Nouvelle intervention assignée / تم تكليفك بمهمة جديدة : "${titre}". Suivi ici / تابع هنا : ${link}`
  );
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

export async function setInterventionUrgence(interventionId: string, urgence: Urgence) {
  await auth.protect();
  if (!(URGENCES as readonly string[]).includes(urgence)) throw new Error("Urgence invalide.");

  const db = getDb();
  await db.update(interventions).set({ urgence, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  if (urgence === "critique") {
    const [current] = await db
      .select({
        titre: interventions.titre,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(interventions)
      .leftJoin(villas, eq(interventions.villaId, villas.id))
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (current) {
      await notifyStaffWhatsApp(
        `Intervention passée en CRITIQUE : "${current.titre}"${current.villaNom ? ` — ${current.villaNom} (n°${current.villaNumero})` : ""}.`
      );
    }
  }

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
}

// Volontairement sans auth.protect() : le propriétaire pilote lui-même la jauge et la
// priorité depuis son lien public /p/[token], sur le même principe que les échanges et la
// validation de devis (l'identifiant d'intervention, déjà connu via la page, fait office de jeton).
export async function setInterventionEtapePublic(interventionId: string, etape: Etape) {
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

export async function setInterventionUrgencePublic(interventionId: string, urgence: Urgence) {
  if (!(URGENCES as readonly string[]).includes(urgence)) throw new Error("Urgence invalide.");

  const db = getDb();
  await db.update(interventions).set({ urgence, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  if (urgence === "critique") {
    const [current] = await db
      .select({
        titre: interventions.titre,
        villaNom: villas.nom,
        villaNumero: villas.numero,
      })
      .from(interventions)
      .leftJoin(villas, eq(interventions.villaId, villas.id))
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (current) {
      await notifyStaffWhatsApp(
        `Intervention passée en CRITIQUE (par le propriétaire) : "${current.titre}"${current.villaNom ? ` — ${current.villaNom} (n°${current.villaNumero})` : ""}.`
      );
    }
  }

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
}

export async function setInterventionCategorie(interventionId: string, categorie: Categorie) {
  await auth.protect();
  if (!(CATEGORIE_KEYS as string[]).includes(categorie)) throw new Error("Catégorie invalide.");

  const db = getDb();
  await db.update(interventions).set({ categorie, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Volontairement sans auth.protect(), même principe que setInterventionEtapePublic/UrgencePublic.
export async function setInterventionCategoriePublic(interventionId: string, categorie: Categorie) {
  if (!(CATEGORIE_KEYS as string[]).includes(categorie)) throw new Error("Catégorie invalide.");

  const db = getDb();
  await db.update(interventions).set({ categorie, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function setInterventionTechnician(interventionId: string, technicianId: string | null) {
  await auth.protect();
  const db = getDb();
  await db
    .update(interventions)
    .set({ technicianId, updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  if (technicianId) {
    const [current] = await db
      .select({ titre: interventions.titre })
      .from(interventions)
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (current) await notifyTechnicianAssignment(technicianId, current.titre);
  }

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Actions scopées "technicien" : volontairement sans auth.protect(), sur le même principe que
// les actions propriétaire — le technicien agit via son lien perso /t/[token], sans connexion.
// Chaque action vérifie que l'intervention ciblée lui est bien assignée avant d'écrire.
async function requireInterventionForTechnicianToken(token: string, interventionId: string) {
  const db = getDb();
  const [tech] = await db.select({ id: technicians.id }).from(technicians).where(eq(technicians.accessToken, token)).limit(1);
  if (!tech) throw new Error("Lien technicien invalide.");

  const [intervention] = await db
    .select({ id: interventions.id, technicianId: interventions.technicianId })
    .from(interventions)
    .where(and(eq(interventions.id, interventionId), eq(interventions.technicianId, tech.id)))
    .limit(1);
  if (!intervention) throw new Error("Intervention non assignée à ce technicien.");

  return db;
}

export async function setInterventionEtapeByTechnician(token: string, interventionId: string, etape: Etape) {
  if (!ETAPES.includes(etape)) throw new Error("Étape invalide.");
  const db = await requireInterventionForTechnicianToken(token, interventionId);
  const timestampField = ETAPE_TIMESTAMP_FIELD[etape];

  await db
    .update(interventions)
    .set({ etape, [timestampField]: new Date(), updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath(`/t/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function addInterventionAttachmentsByTechnician(token: string, interventionId: string, urls: string[]) {
  const db = await requireInterventionForTechnicianToken(token, interventionId);
  const [existing] = await db.select().from(interventions).where(eq(interventions.id, interventionId)).limit(1);
  if (!existing) throw new Error("Intervention introuvable.");

  await db
    .update(interventions)
    .set({ attachmentUrls: [...(existing.attachmentUrls ?? []), ...urls], updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath(`/t/${token}`);
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

  await maybeAutoDispatchMaintenance(interventionId);

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
}

// Volontairement sans auth.protect() : le propriétaire valide via son espace public
// /p/[token], sans se connecter. La portée est limitée à ces deux champs.
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
}
