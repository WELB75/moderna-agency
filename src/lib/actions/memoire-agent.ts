"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMemoireCodes, agentMemoireFiches } from "@/db/schema-memoire-agent";
import { villas } from "@/db/schema";
import { Beds24ConfigError } from "@/lib/beds24/client";
import { apprendreLot, assurerTablesMemoire, chercherCodes, consoliderTheme, themesAConsolider, type BilanApprentissage, type BilanCodes } from "@/lib/messages-agent/memoire";
import { THEMES } from "@/lib/messages-agent/memoire-regles";
import { tracer } from "@/lib/journal";

// Actions de la page "Mémoire de l'agent". Compte connecté de l'équipe (comme les autres actions).

function message(err: unknown): string {
  if (err instanceof Beds24ConfigError) return "Beds24 n'est pas configuré (jeton absent).";
  return err instanceof Error ? err.message : "Erreur.";
}

// En production, Next.js masque le message d'une erreur levée par une action serveur ("An error
// occurred in the Server Components render...") : on renvoie donc l'erreur comme donnée, pour
// qu'elle s'affiche telle quelle sur la page.
export type ResultatLot = BilanApprentissage & { erreur?: string };

// Un lot de fils à lire et analyser. La page rappelle cette action tant que `restants` > 0.
export async function apprendreLotAction(mode: "tout" | "recents"): Promise<ResultatLot> {
  await auth.protect();
  try {
    return await apprendreLot(mode);
  } catch (err) {
    console.error("Mémoire agent : lecture des fils:", err);
    return { analyses: 0, vides: 0, erreurs: 0, echanges: 0, restants: 0, erreur: message(err) };
  }
}

// Consolide quelques thèmes à la fois (un thème en échec n'arrête pas les autres) ; renvoie
// combien il en reste.
export async function consoliderAction(): Promise<{ faits: number; restants: number; fiches: number; erreurs: string[] }> {
  await auth.protect();
  try {
    const sales = await themesAConsolider();
    const lot = sales.slice(0, 3);
    const resultats = await Promise.allSettled(lot.map((t) => consoliderTheme(t)));
    const erreurs = resultats.flatMap((r, i) => {
      if (r.status === "fulfilled") return [];
      console.error(`Mémoire agent : consolidation du thème ${lot[i]}:`, r.reason);
      return [`${lot[i]} : ${message(r.reason)}`];
    });
    const fiches = resultats.reduce((total, r) => total + (r.status === "fulfilled" ? r.value : 0), 0);
    revalidatePath("/memoire-agent");
    // Les thèmes en échec restent "à consolider" : on s'arrête si rien n'a abouti (pas de boucle infinie).
    return { faits: lot.length - erreurs.length, restants: sales.length - lot.length, fiches, erreurs };
  } catch (err) {
    console.error("Mémoire agent : consolidation:", err);
    return { faits: 0, restants: 0, fiches: 0, erreurs: [message(err)] };
  }
}

export async function basculerFiche(id: string, actif: boolean): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  await getDb().update(agentMemoireFiches).set({ actif, updatedAt: new Date() }).where(eq(agentMemoireFiches.id, id));
  revalidatePath("/memoire-agent");
}

export async function supprimerFiche(id: string): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  await getDb().delete(agentMemoireFiches).where(eq(agentMemoireFiches.id, id));
  revalidatePath("/memoire-agent");
}

type ChampsFiche = { titre: string; question: string; reponse: string };

function nettoyer(c: ChampsFiche): ChampsFiche {
  const titre = c.titre.trim();
  const question = c.question.trim();
  const reponse = c.reponse.trim();
  if (!titre || !question || !reponse) throw new Error("Titre, question et réponse sont obligatoires.");
  return { titre: titre.slice(0, 200), question: question.slice(0, 1500), reponse: reponse.slice(0, 4000) };
}

// Fiche corrigée à la main : épinglée, la consolidation automatique ne la réécrit plus.
export async function modifierFiche(id: string, champs: ChampsFiche): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  await getDb().update(agentMemoireFiches).set({ ...nettoyer(champs), epingle: true, updatedAt: new Date() }).where(eq(agentMemoireFiches.id, id));
  await tracer({ categorie: "agent_ia", action: "memoire_modifiee", libelle: "Fiche de la mémoire de l'agent modifiée", resume: champs.titre.trim() });
  revalidatePath("/memoire-agent");
}

export async function ajouterFiche(theme: string, champs: ChampsFiche): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  if (!THEMES.some((t) => t.code === theme)) throw new Error("Thème inconnu.");
  await getDb().insert(agentMemoireFiches).values({ theme, ...nettoyer(champs), epingle: true, nbSources: 1 });
  await tracer({ categorie: "agent_ia", action: "memoire_ajoutee", libelle: "Fiche ajoutée à la mémoire de l'agent", resume: champs.titre.trim() });
  revalidatePath("/memoire-agent");
}

// Cherche wifi, code du boîtier et code de la porte dans les messages déjà échangés avec les
// voyageurs, et les propose (rien n'est appliqué sans clic).
export async function chercherCodesAction(): Promise<BilanCodes> {
  await auth.protect();
  try {
    const bilan = await chercherCodes();
    revalidatePath("/memoire-agent");
    return bilan;
  } catch (err) {
    console.error("Mémoire agent : recherche des codes:", err);
    return { logements: 0, propositions: 0, deja: 0, erreurs: [message(err)] };
  }
}

const COLONNE_CODE = { wifi: "codeWifi", boitier: "codeBoitier", porte: "codePorteEntree" } as const;
const LIBELLE_CODE = { wifi: "wifi", boitier: "boîtier à clés", porte: "porte d'entrée" } as const;

// Applique un code proposé sur la fiche du logement (remplace la valeur actuelle).
export async function appliquerCodeAction(id: string): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  const db = getDb();
  const [p] = await db.select().from(agentMemoireCodes).where(eq(agentMemoireCodes.id, id)).limit(1);
  if (!p) throw new Error("Proposition introuvable.");
  const colonne = COLONNE_CODE[p.type as keyof typeof COLONNE_CODE];
  if (!colonne) throw new Error("Type de code inconnu.");
  const modifies = await db.update(villas).set({ [colonne]: p.valeur }).where(eq(villas.nom, p.villaNom)).returning({ id: villas.id });
  if (modifies.length === 0) throw new Error(`Logement « ${p.villaNom} » introuvable.`);
  await db.update(agentMemoireCodes).set({ statut: "applique" }).where(eq(agentMemoireCodes.id, id));
  await tracer({
    categorie: "villa",
    action: "code_villa_modifie",
    libelle: `Code ${LIBELLE_CODE[p.type as keyof typeof LIBELLE_CODE]} mis à jour depuis les messages`,
    resume: p.villaNom,
    villaId: modifies[0].id,
    villaNom: p.villaNom,
  });
  revalidatePath("/memoire-agent");
  revalidatePath("/villas");
}

export async function ignorerCodeAction(id: string): Promise<void> {
  await auth.protect();
  await assurerTablesMemoire();
  await getDb().update(agentMemoireCodes).set({ statut: "ignore" }).where(eq(agentMemoireCodes.id, id));
  revalidatePath("/memoire-agent");
}
