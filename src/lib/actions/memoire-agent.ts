"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentMemoireFiches } from "@/db/schema-memoire-agent";
import { Beds24ConfigError } from "@/lib/beds24/client";
import { apprendreLot, assurerTablesMemoire, consoliderTheme, themesAConsolider, type BilanApprentissage } from "@/lib/messages-agent/memoire";
import { THEMES } from "@/lib/messages-agent/memoire-regles";
import { tracer } from "@/lib/journal";

// Actions de la page "Mémoire de l'agent". Compte connecté de l'équipe (comme les autres actions).

function message(err: unknown): string {
  if (err instanceof Beds24ConfigError) return "Beds24 n'est pas configuré (jeton absent).";
  return err instanceof Error ? err.message : "Erreur.";
}

// Un lot de fils à lire et analyser. La page rappelle cette action tant que `restants` > 0.
export async function apprendreLotAction(mode: "tout" | "recents"): Promise<BilanApprentissage> {
  await auth.protect();
  try {
    return await apprendreLot(mode);
  } catch (err) {
    throw new Error(message(err));
  }
}

// Consolide quelques thèmes à la fois ; renvoie combien il en reste.
export async function consoliderAction(): Promise<{ faits: number; restants: number; fiches: number }> {
  await auth.protect();
  try {
    const sales = await themesAConsolider();
    const lot = sales.slice(0, 3);
    const resultats = await Promise.all(lot.map((t) => consoliderTheme(t)));
    revalidatePath("/memoire-agent");
    return { faits: lot.length, restants: sales.length - lot.length, fiches: resultats.reduce((a, b) => a + b, 0) };
  } catch (err) {
    throw new Error(message(err));
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
