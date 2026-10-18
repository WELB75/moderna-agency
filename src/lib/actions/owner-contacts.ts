"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { proprieteContacts, technicians, villas } from "@/db/schema";
import { tracer } from "@/lib/journal";

const CONTACT_ROLES = [
  "proprietaire",
  "femme_menage",
  "jardinier",
  "pisciniste",
  "gardien",
  "electricien",
  "plombier",
  "cuisiniere",
  "autre",
] as const;
type ContactRole = (typeof CONTACT_ROLES)[number];

function guessRoleFromFonction(fonction: string): ContactRole {
  const f = fonction.trim().toLowerCase();
  const match = CONTACT_ROLES.find((r) => r !== "autre" && f.includes(r.replace("_", " ")));
  return match ?? "autre";
}

// Volontairement sans auth.protect() : le propriétaire ajoute un contact à son équipe
// depuis son lien public /p/[token], sans connexion. Portée limitée à sa propre villa
// (villaId déjà connu via le token, pas saisi par l'utilisateur).
export async function createContactByOwner(villaId: string, formData: FormData) {
  const role = String(formData.get("role") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();

  if (!nom) throw new Error("Le nom est obligatoire.");
  const safeRole = (CONTACT_ROLES as readonly string[]).includes(role) ? (role as ContactRole) : "autre";

  const db = getDb();
  await db.insert(proprieteContacts).values({
    villaId,
    role: safeRole,
    nom,
    telephone: telephone || null,
  });

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({
    categorie: "logement",
    action: "contact_ajoute_proprietaire",
    libelle: "Contact ajouté par le propriétaire",
    resume: `${nom} (${safeRole})${villa ? ` - ${villa.nom}` : ""}`,
    villaId,
    villaNom: villa?.nom ?? null,
    auteur: { type: "humain", id: null, nom: "Propriétaire (lien)", email: null },
  });

  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}

// Reprend un prestataire déjà connu de l'agence (technicien assigné à des interventions)
// et l'ajoute à l'équipe de cette villa, sans que le propriétaire n'ait à ressaisir ses infos.
export async function addTechnicianAsContactByOwner(villaId: string, technicianId: string) {
  const db = getDb();
  const [technician] = await db.select().from(technicians).where(eq(technicians.id, technicianId)).limit(1);
  if (!technician) throw new Error("Prestataire introuvable.");

  await db.insert(proprieteContacts).values({
    villaId,
    role: guessRoleFromFonction(technician.fonction),
    nom: technician.nom,
    telephone: technician.telephone,
  });

  const [villa] = await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, villaId)).limit(1);
  await tracer({
    categorie: "logement",
    action: "contact_ajoute_proprietaire",
    libelle: "Prestataire ajouté à l'équipe par le propriétaire",
    resume: `${technician.nom}${villa ? ` - ${villa.nom}` : ""}`,
    villaId,
    villaNom: villa?.nom ?? null,
    auteur: { type: "humain", id: null, nom: "Propriétaire (lien)", email: null },
  });

  revalidatePath("/villas");
  revalidatePath(`/villas/${villaId}`);
}
