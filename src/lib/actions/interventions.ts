"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { interventions, technicians, villas } from "@/db/schema";
import type { Devis } from "@/lib/devis-types";
import type { Urgence } from "@/lib/intervention-urgence";
import { CATEGORIES, type Categorie } from "@/lib/intervention-categorie";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { analyzeInterventionPhoto } from "@/lib/intervention-photo-ai";
import { getBaseUrl } from "@/lib/base-url";
import { KAMEL_PHONE } from "@/lib/kamel-phone";
import { isValidMaintenanceToken } from "@/lib/maintenance-access-token";

// Dès qu'un problème décrit ET au moins une photo sont réunis sur une intervention SANS
// technicien déjà choisi à la main, on laisse l'IA proposer elle-même le technicien le plus
// pertinent (voir maintenance-ai.ts) plutôt que d'attendre que Kamel en assigne un — Kamel,
// 2026-08-18. initiateMaintenanceRequest est déjà idempotent (ne fait rien si une conversation
// existe déjà pour cette intervention), donc sûr à appeler à chaque fois que l'un des deux
// éléments arrive (problème à la création, photo ajoutée après, ou l'inverse).
//
// Appel HTTP interne volontaire vers /api/maintenance/dispatch plutôt qu'un import (statique OU
// dynamique — les deux testés, voir historique de commits) de maintenance-ai.ts : ce module tire
// le SDK Anthropic + @vercel/blob, et interventions.ts est un fichier "use server" — dans les
// DEUX cas, ça casse le bundling Turbopack des Server Actions ("Received an instance of URL", vu
// en prod le 2026-08-19). Le même module importé depuis une route API classique (comme
// whatsapp-webhook/route.ts) n'a jamais eu ce problème, d'où l'appel HTTP plutôt qu'un import.
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
    const baseUrl = getBaseUrl();
    if (!baseUrl) throw new Error("Base URL introuvable (NEXT_PUBLIC_APP_URL / VERCEL_URL absents).");
    const res = await fetch(`${baseUrl}/api/maintenance/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {}),
      },
      body: JSON.stringify({ interventionId }),
    });
    if (!res.ok) throw new Error(`Dispatch IA maintenance : ${res.status} ${await res.text()}`);
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

// Préremplissage IA du formulaire "Nouvelle intervention" à partir d'une photo déjà envoyée
// (voir AddInterventionDialog) — Kamel, 2026-09-09 : "je veux un formulaire propre avec ia j'ai
// juste a prendre en photo, ou video, ou importer". Renvoie juste des suggestions à relire,
// jamais une création directe.
export async function analyzeInterventionPhotoUrl(photoUrl: string) {
  await auth.protect();
  const extraction = await analyzeInterventionPhoto(photoUrl);
  return {
    probleme: extraction.probleme,
    categorie: (CATEGORIE_KEYS as string[]).includes(extraction.categorie) ? (extraction.categorie as Categorie) : "autre",
    urgence: (URGENCES as readonly string[]).includes(extraction.urgence) ? (extraction.urgence as Urgence) : "normale",
    warnings: extraction.warnings,
  };
}

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
  // Photos/vidéos déjà uploadées côté client (voir AddInterventionDialog) avant l'appel à cette
  // action — utile pour que le dispatch IA (probleme + photo requis) puisse se déclencher dès la
  // création, sans passer par un aller-retour "créer puis ajouter une pièce jointe".
  let attachmentUrls: string[] = [];
  try {
    const raw = String(formData.get("attachmentUrls") ?? "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) attachmentUrls = parsed.filter((u) => typeof u === "string");
  } catch {
    attachmentUrls = [];
  }

  if (!titre) throw new Error("Le souci est obligatoire.");

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
      attachmentUrls,
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

// Vitrine minimale à 3 onglets (En cours / Catégories / Ajouter) sur /travaux/[token], réservée
// aux constats/travaux d'une seule villa — Kamel, 2026-09-09 : "je veux pas le calendrier proprio
// [...] ne laisse que les travaux en cours, l'autre onglet les catégories, et l'autre le genre de
// formulaire scann ia et c'est tout". Même token que le lien propriétaire complet (/p/[token]),
// mais volontairement sans auth.protect() ici aussi : portée limitée à la villa que le token
// désigne, jamais saisie par l'appelant.
async function villaIdFromToken(token: string): Promise<string> {
  const db = getDb();
  const [villa] = await db.select({ id: villas.id }).from(villas).where(eq(villas.lienProprietaireToken, token)).limit(1);
  if (!villa) throw new Error("Lien invalide.");
  return villa.id;
}

export async function analyzeInterventionPhotoByToken(token: string, photoUrl: string) {
  await villaIdFromToken(token); // valide le token avant d'appeler l'IA (évite un usage à l'aveugle du lien)
  const extraction = await analyzeInterventionPhoto(photoUrl);
  return {
    probleme: extraction.probleme,
    categorie: (CATEGORIE_KEYS as string[]).includes(extraction.categorie) ? (extraction.categorie as Categorie) : "autre",
    urgence: (URGENCES as readonly string[]).includes(extraction.urgence) ? (extraction.urgence as Urgence) : "normale",
    warnings: extraction.warnings,
  };
}

export async function createInterventionByToken(
  token: string,
  data: { probleme: string; categorie: Categorie; urgence: Urgence; attachmentUrls: string[] }
) {
  const villaId = await villaIdFromToken(token);
  const probleme = data.probleme.trim();
  if (!probleme) throw new Error("Décris le problème.");
  const safeUrgence = (URGENCES as readonly string[]).includes(data.urgence) ? data.urgence : "normale";
  const safeCategorie = (CATEGORIE_KEYS as string[]).includes(data.categorie) ? data.categorie : "autre";

  const db = getDb();
  const [created] = await db
    .insert(interventions)
    .values({
      titre: probleme,
      probleme,
      villaId,
      urgence: safeUrgence,
      categorie: safeCategorie,
      attachmentUrls: data.attachmentUrls,
      origine: "staff",
      createdByName: "Équipe (lien travaux)",
    })
    .returning({ id: interventions.id });

  await maybeAutoDispatchMaintenance(created.id);

  revalidatePath(`/travaux/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Page d'accueil client /bienvenue/[token] — jeton lienClientToken, DISTINCT du lien
// propriétaire (villaIdFromToken ci-dessus) : ce lien est affiché en QR code dans la villa, donc
// vu par n'importe qui, il ne doit jamais donner accès à l'espace propriétaire. Portée limitée à
// un simple signalement (pas de liste des tâches existantes, pas de suppression).
async function villaIdFromGuestToken(token: string): Promise<string> {
  const db = getDb();
  const [villa] = await db.select({ id: villas.id }).from(villas).where(eq(villas.lienClientToken, token)).limit(1);
  if (!villa) throw new Error("Lien invalide.");
  return villa.id;
}

export async function createInterventionByGuestToken(
  token: string,
  data: { probleme: string; attachmentUrls: string[] }
) {
  const villaId = await villaIdFromGuestToken(token);
  const probleme = data.probleme.trim();
  if (!probleme) throw new Error("Décris le problème.");

  const db = getDb();
  const [created] = await db
    .insert(interventions)
    .values({
      titre: probleme,
      probleme,
      villaId,
      urgence: "normale",
      categorie: "autre",
      attachmentUrls: data.attachmentUrls,
      origine: "client",
      createdByName: "Client (espace bienvenue)",
    })
    .returning({ id: interventions.id });

  await maybeAutoDispatchMaintenance(created.id);

  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

// Corbeille sur /travaux/[token] (voir InterventionPublicCard) — Kamel, 2026-09-09 : "met moi
// une corbeille pour supprimer certaines tache". Vérifie que la fiche appartient bien à la villa
// du token avant de supprimer, pour qu'un token ne puisse jamais supprimer la fiche d'une autre
// villa même en devinant un id.
export async function deleteInterventionByToken(token: string, interventionId: string) {
  const villaId = await villaIdFromToken(token);
  const db = getDb();
  const [existing] = await db.select({ villaId: interventions.villaId }).from(interventions).where(eq(interventions.id, interventionId)).limit(1);
  if (!existing || existing.villaId !== villaId) throw new Error("Fiche introuvable.");
  await db.delete(interventions).where(eq(interventions.id, interventionId));
  revalidatePath(`/travaux/${token}`);
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

// Utilise sendWhatsAppText (même mécanisme que l'agent maintenance, déjà éprouvé) plutôt que
// notifyPhoneWhatsApp (message "template" Meta) : ce dernier exige un modèle pré-approuvé via
// WHATSAPP_TEMPLATE_NAME, jamais configuré sur ce projet — le message partait silencieusement
// dans le vide dès qu'un technicien était choisi à la main. Vu en prod le 2026-08-19.
async function notifyTechnicianAssignment(technicianId: string, titre: string) {
  const db = getDb();
  const [tech] = await db
    .select({ telephone: technicians.telephone, accessToken: technicians.accessToken, nom: technicians.nom })
    .from(technicians)
    .where(eq(technicians.id, technicianId))
    .limit(1);
  if (!tech) return;

  const baseUrl = getBaseUrl();
  const link = baseUrl ? `${baseUrl}/t/${tech.accessToken}` : `/t/${tech.accessToken}`;
  const { sendWhatsAppText } = await import("@/lib/whatsapp-agent/send");
  await sendWhatsAppText(
    tech.telephone,
    `Nouvelle intervention assignée / تم تكليفك بمهمة جديدة : "${titre}". Suivi ici / تابع هنا : ${link}`
  );
  // Kamel, 2026-08-20 : "j'ai pas eu de compte rendu... par rapport à Metafroid" — cette
  // affectation manuelle ne passe pas par la conversation IA (voir maintenance-ai.ts), qui a ses
  // propres compte-rendus ; celle-ci n'en avait aucun jusqu'ici.
  await sendWhatsAppText(KAMEL_PHONE, `"${titre}" : message envoyé à ${tech.nom} (assignation manuelle).`);
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
  } else {
    // Technicien retiré : si problème + photo sont déjà là, laisse l'IA reproposer un
    // technicien plutôt que de rester bloqué sans rien tant que personne ne retouche la pièce
    // jointe.
    await maybeAutoDispatchMaintenance(interventionId);
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

// Actions scopées "espace maintenance" (/m/[token]) : jeton unique partagé (voir
// maintenance-access-token.ts) plutôt qu'un token par personne — l'équipe entière (technicien,
// responsable...) y ajoute des photos et fait avancer le statut sans compte Clerk, sur tout le
// périmètre (toutes villas), contrairement au lien technicien qui reste limité à ses propres
// interventions assignées. Chaque action revérifie le jeton (jamais confiance dans le seul rendu
// de la page).
function requireMaintenanceToken(token: string) {
  if (!isValidMaintenanceToken(token)) throw new Error("Lien maintenance invalide.");
}

export async function analyzeInterventionPhotoByMaintenanceToken(token: string, photoUrl: string) {
  requireMaintenanceToken(token);
  const extraction = await analyzeInterventionPhoto(photoUrl);
  return {
    probleme: extraction.probleme,
    categorie: (CATEGORIE_KEYS as string[]).includes(extraction.categorie) ? (extraction.categorie as Categorie) : "autre",
    urgence: (URGENCES as readonly string[]).includes(extraction.urgence) ? (extraction.urgence as Urgence) : "normale",
    warnings: extraction.warnings,
  };
}

export async function createInterventionByMaintenanceToken(token: string, formData: FormData) {
  requireMaintenanceToken(token);

  const titre = String(formData.get("titre") ?? "").trim();
  const probleme = String(formData.get("probleme") ?? "").trim();
  const lieu = String(formData.get("lieu") ?? "").trim();
  const villaId = String(formData.get("villaId") ?? "").trim() || null;
  const domaineId = String(formData.get("domaineId") ?? "").trim() || null;
  const technicianId = String(formData.get("technicianId") ?? "").trim() || null;
  const urgenceRaw = String(formData.get("urgence") ?? "normale").trim();
  const urgence = (URGENCES as readonly string[]).includes(urgenceRaw) ? (urgenceRaw as Urgence) : "normale";
  const categorieRaw = String(formData.get("categorie") ?? "autre").trim();
  const categorie = (CATEGORIE_KEYS as string[]).includes(categorieRaw) ? (categorieRaw as Categorie) : "autre";
  let attachmentUrls: string[] = [];
  try {
    const raw = String(formData.get("attachmentUrls") ?? "[]");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) attachmentUrls = parsed.filter((u) => typeof u === "string");
  } catch {
    attachmentUrls = [];
  }

  if (!titre) throw new Error("Le souci est obligatoire.");

  const db = getDb();
  const [created] = await db
    .insert(interventions)
    .values({
      titre,
      probleme: probleme || null,
      lieu: lieu || null,
      villaId,
      domaineId,
      technicianId,
      urgence,
      categorie,
      attachmentUrls,
      origine: "staff",
      createdByName: "Équipe (espace maintenance)",
    })
    .returning({ id: interventions.id });

  if (technicianId) {
    await notifyTechnicianAssignment(technicianId, titre);
  } else {
    await maybeAutoDispatchMaintenance(created.id);
  }

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function setInterventionEtapeByMaintenanceToken(token: string, interventionId: string, etape: Etape) {
  requireMaintenanceToken(token);
  if (!ETAPES.includes(etape)) throw new Error("Étape invalide.");

  const db = getDb();
  const timestampField = ETAPE_TIMESTAMP_FIELD[etape];
  await db
    .update(interventions)
    .set({ etape, [timestampField]: new Date(), updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function setInterventionUrgenceByMaintenanceToken(token: string, interventionId: string, urgence: Urgence) {
  requireMaintenanceToken(token);
  if (!(URGENCES as readonly string[]).includes(urgence)) throw new Error("Urgence invalide.");

  const db = getDb();
  await db.update(interventions).set({ urgence, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  if (urgence === "critique") {
    const [current] = await db
      .select({ titre: interventions.titre, villaNom: villas.nom, villaNumero: villas.numero })
      .from(interventions)
      .leftJoin(villas, eq(interventions.villaId, villas.id))
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (current) {
      await notifyStaffWhatsApp(
        `Intervention passée en CRITIQUE (espace maintenance) : "${current.titre}"${current.villaNom ? ` — ${current.villaNom} (n°${current.villaNumero})` : ""}.`
      );
    }
  }

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
}

export async function setInterventionCategorieByMaintenanceToken(token: string, interventionId: string, categorie: Categorie) {
  requireMaintenanceToken(token);
  if (!(CATEGORIE_KEYS as string[]).includes(categorie)) throw new Error("Catégorie invalide.");

  const db = getDb();
  await db.update(interventions).set({ categorie, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function setInterventionTechnicianByMaintenanceToken(
  token: string,
  interventionId: string,
  technicianId: string | null
) {
  requireMaintenanceToken(token);
  const db = getDb();
  await db.update(interventions).set({ technicianId, updatedAt: new Date() }).where(eq(interventions.id, interventionId));

  if (technicianId) {
    const [current] = await db
      .select({ titre: interventions.titre })
      .from(interventions)
      .where(eq(interventions.id, interventionId))
      .limit(1);
    if (current) await notifyTechnicianAssignment(technicianId, current.titre);
  } else {
    await maybeAutoDispatchMaintenance(interventionId);
  }

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function addInterventionAttachmentsByMaintenanceToken(token: string, interventionId: string, urls: string[]) {
  requireMaintenanceToken(token);
  const db = getDb();
  const [existing] = await db.select().from(interventions).where(eq(interventions.id, interventionId)).limit(1);
  if (!existing) throw new Error("Intervention introuvable.");

  await db
    .update(interventions)
    .set({ attachmentUrls: [...(existing.attachmentUrls ?? []), ...urls], updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  await maybeAutoDispatchMaintenance(interventionId);

  revalidatePath(`/m/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
}

export async function updateInterventionNotesByMaintenanceToken(token: string, interventionId: string, notes: string) {
  requireMaintenanceToken(token);
  const db = getDb();
  await db
    .update(interventions)
    .set({ notes: notes || null, updatedAt: new Date() })
    .where(eq(interventions.id, interventionId));

  revalidatePath(`/m/${token}`);
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
