"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accesEquipe } from "@/db/schema-acces";
import {
  assurerTableAcces,
  estAdminPermanent,
  normaliserEmail,
  statutAcces,
  viderCacheAcces,
  type RoleAcces,
  type StatutCompte,
} from "@/lib/acces";
import { tracer } from "@/lib/journal";

// Gestion des comptes du back-office (page Accès) : réservée aux administrateurs (Kamel, Fouad).
// Chaque action revérifie l'administrateur côté serveur — une action serveur reste appelable sans
// passer par la page.

export type LigneAcces = {
  id: string;
  email: string;
  nom: string | null;
  role: RoleAcces;
  statut: StatutCompte;
  permanent: boolean;
  decidePar: string | null;
  decideLe: string | null;
  derniereTentative: string | null;
  createdAt: string;
};

async function exigerAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Connexion requise.");
  const moi = await statutAcces(userId);
  if (!moi.autorise || moi.role !== "admin") throw new Error("Réservé aux administrateurs (Kamel et Fouad).");
  return moi;
}

export async function listerAcces(): Promise<LigneAcces[]> {
  await exigerAdmin();
  await assurerTableAcces();
  const lignes = await getDb()
    .select()
    .from(accesEquipe)
    .orderBy(desc(accesEquipe.derniereTentative), asc(accesEquipe.email));
  return lignes.map((l) => ({
    id: l.id,
    email: l.email,
    nom: l.nom,
    role: l.role === "admin" ? "admin" : "membre",
    statut: l.statut,
    permanent: estAdminPermanent(l.email),
    decidePar: l.decidePar,
    decideLe: l.decideLe ? l.decideLe.toISOString() : null,
    derniereTentative: l.derniereTentative ? l.derniereTentative.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));
}

async function ligneParId(id: string) {
  const [ligne] = await getDb().select().from(accesEquipe).where(eq(accesEquipe.id, id)).limit(1);
  if (!ligne) throw new Error("Compte introuvable.");
  return ligne;
}

export async function changerStatutAcces(id: string, statut: StatutCompte): Promise<void> {
  const moi = await exigerAdmin();
  await assurerTableAcces();
  if (!["autorise", "en_attente", "refuse"].includes(statut)) throw new Error("Statut inconnu.");
  const ligne = await ligneParId(id);
  if (estAdminPermanent(ligne.email) && statut !== "autorise") {
    throw new Error("Kamel et Fouad gardent toujours l'accès (administrateurs permanents).");
  }
  if (ligne.email === moi.email && statut !== "autorise") throw new Error("Vous ne pouvez pas retirer votre propre accès.");

  await getDb()
    .update(accesEquipe)
    .set({ statut, decidePar: moi.nom ?? moi.email, decideLe: new Date() })
    .where(eq(accesEquipe.id, id));
  viderCacheAcces(ligne.email);
  await tracer({
    categorie: "acces",
    action: statut === "autorise" ? "acces_autorise" : "acces_retire",
    libelle: statut === "autorise" ? "Accès au back-office autorisé" : "Accès au back-office retiré",
    resume: `${ligne.nom ?? ligne.email} (${ligne.email})`,
  });
  revalidatePath("/acces");
}

export async function changerRoleAcces(id: string, role: RoleAcces): Promise<void> {
  const moi = await exigerAdmin();
  await assurerTableAcces();
  if (role !== "admin" && role !== "membre") throw new Error("Rôle inconnu.");
  const ligne = await ligneParId(id);
  if (estAdminPermanent(ligne.email)) throw new Error("Kamel et Fouad restent administrateurs.");

  await getDb()
    .update(accesEquipe)
    .set({ role, decidePar: moi.nom ?? moi.email, decideLe: new Date() })
    .where(eq(accesEquipe.id, id));
  viderCacheAcces(ligne.email);
  await tracer({
    categorie: "acces",
    action: "acces_role_modifie",
    libelle: role === "admin" ? "Compte passé administrateur" : "Compte passé membre",
    resume: `${ligne.nom ?? ligne.email} (${ligne.email})`,
  });
  revalidatePath("/acces");
}

// Autorise un compte à l'avance (avant sa première connexion), par son adresse e-mail.
export async function ajouterAcces(input: { email: string; nom: string; role: RoleAcces }): Promise<void> {
  const moi = await exigerAdmin();
  await assurerTableAcces();
  const email = normaliserEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  const role: RoleAcces = input.role === "admin" ? "admin" : "membre";
  const nom = input.nom.trim() || null;

  await getDb()
    .insert(accesEquipe)
    .values({ email, nom, role, statut: "autorise", decidePar: moi.nom ?? moi.email, decideLe: new Date() })
    .onConflictDoUpdate({
      target: accesEquipe.email,
      set: { statut: "autorise", role, nom: nom ?? undefined, decidePar: moi.nom ?? moi.email, decideLe: new Date() },
    });
  viderCacheAcces(email);
  await tracer({
    categorie: "acces",
    action: "acces_autorise",
    libelle: "Accès au back-office autorisé",
    resume: `${nom ?? email} (${email})${role === "admin" ? " · administrateur" : ""}`,
  });
  revalidatePath("/acces");
}
