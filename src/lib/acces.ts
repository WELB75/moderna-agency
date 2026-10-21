import { clerkClient } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accesEquipe } from "@/db/schema-acces";

// Qui peut ouvrir le back-office (2026-10-21, « commençons par la sécurité »). Avant ce contrôle,
// être connecté à Clerk suffisait : l'instance Clerk accepte les inscriptions publiques, donc
// n'importe qui pouvait créer un compte sur admin.superhosts.ma/sign-up et voir passeports, fiches
// police et paiements. Désormais un compte doit figurer dans acces_equipe avec le statut
// "autorise" ; les autres sont redirigés vers /acces-refuse (voir src/proxy.ts) et apparaissent
// "en attente" dans la page Accès, où un administrateur les valide en un clic.
//
// Comptes gardés au 2026-10-21 : Kamel seul, plus Fouad comme administrateur (« Kamel et Fouad »
// gèrent les accès). Ces deux-là sont permanents : toujours autorisés et administrateurs, même si
// la table est vide ou modifiée, pour que personne ne puisse fermer la porte à tout le monde.
export const ADMINS_PERMANENTS: { email: string; nom: string }[] = [
  { email: "tmshparis@gmail.com", nom: "Kamel Paris" },
  { email: "jaielfouad@gmail.com", nom: "Fouad Jaiel" },
];

// Comptes déjà vus dans le journal des connexions mais non retenus le 2026-10-21 : créés "en
// attente" pour qu'un administrateur puisse les réautoriser d'un clic s'il le faut.
const COMPTES_EN_ATTENTE_INITIAUX: { email: string; nom: string }[] = [
  { email: "modernaagency04@gmail.com", nom: "Imane Haimoudi" },
  { email: "aanas.jaiel@gmail.com", nom: "aanas.jaiel@gmail.com" },
];

export type RoleAcces = "admin" | "membre";
export type StatutCompte = "autorise" | "en_attente" | "refuse";

export type AccesEquipe = {
  autorise: boolean;
  email: string | null;
  nom: string | null;
  role: RoleAcces | null;
  // "non_verifie" : adresse e-mail du compte Clerk pas encore confirmée (jamais autorisée).
  statut: StatutCompte | "non_verifie";
};

export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function estAdminPermanent(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = normaliserEmail(email);
  return ADMINS_PERMANENTS.some((a) => a.email === e);
}

let tablePrete: Promise<void> | null = null;

export function assurerTableAcces(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS acces_equipe (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email text NOT NULL,
          nom text,
          role text NOT NULL DEFAULT 'membre',
          statut text NOT NULL DEFAULT 'en_attente',
          clerk_user_id text,
          decide_par text,
          decide_le timestamptz,
          derniere_tentative timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS acces_equipe_email_idx ON acces_equipe (email)`);
      for (const a of ADMINS_PERMANENTS) {
        await db.execute(sql`
          INSERT INTO acces_equipe (email, nom, role, statut, decide_par, decide_le)
          VALUES (${a.email}, ${a.nom}, 'admin', 'autorise', 'Administrateur permanent', now())
          ON CONFLICT (email) DO UPDATE SET role = 'admin', statut = 'autorise'
        `);
      }
      for (const c of COMPTES_EN_ATTENTE_INITIAUX) {
        await db.execute(sql`
          INSERT INTO acces_equipe (email, nom, role, statut)
          VALUES (${c.email}, ${c.nom}, 'membre', 'en_attente')
          ON CONFLICT (email) DO NOTHING
        `);
      }
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

// --- Identité Clerk (e-mail vérifié + nom), mise en cache pour ne pas appeler Clerk à chaque page.

type Identite = { email: string | null; nom: string | null; verifie: boolean };
const DUREE_IDENTITE_MS = 10 * 60 * 1000;
const identites = new Map<string, { valeur: Identite; expire: number }>();

async function identiteClerk(userId: string): Promise<Identite> {
  const enCache = identites.get(userId);
  if (enCache && enCache.expire > Date.now()) return enCache.valeur;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const principale =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0] ?? null;
  const email = principale ? normaliserEmail(principale.emailAddress) : null;
  const verifie = principale?.verification?.status === "verified";
  const nom = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || email;
  const valeur: Identite = { email, nom, verifie };

  if (identites.size > 500) identites.clear();
  identites.set(userId, { valeur, expire: Date.now() + DUREE_IDENTITE_MS });
  return valeur;
}

// --- Statut en base, mis en cache 30 s (un retrait d'accès s'applique donc en moins d'une minute).

type StatutEnBase = { statut: StatutCompte; role: RoleAcces };
const DUREE_STATUT_MS = 30 * 1000;
const statuts = new Map<string, { valeur: StatutEnBase; expire: number }>();
const DELAI_TENTATIVE_MS = 10 * 60 * 1000;
const tentativesNotees = new Map<string, number>();

export function viderCacheAcces(email?: string) {
  if (email) statuts.delete(normaliserEmail(email));
  else statuts.clear();
}

async function statutEnBase(email: string, nom: string | null, userId: string): Promise<StatutEnBase> {
  const enCache = statuts.get(email);
  if (enCache && enCache.expire > Date.now()) return enCache.valeur;

  await assurerTableAcces();
  const db = getDb();
  const [ligne] = await db
    .select({ statut: accesEquipe.statut, role: accesEquipe.role, clerkUserId: accesEquipe.clerkUserId })
    .from(accesEquipe)
    .where(eq(accesEquipe.email, email))
    .limit(1);

  let valeur: StatutEnBase;
  if (!ligne) {
    // Compte inconnu : inscrit en attente, visible dans la page Accès.
    await db
      .insert(accesEquipe)
      .values({ email, nom, role: "membre", statut: "en_attente", clerkUserId: userId, derniereTentative: new Date() })
      .onConflictDoNothing();
    tentativesNotees.set(email, Date.now());
    valeur = { statut: "en_attente", role: "membre" };
  } else {
    valeur = { statut: ligne.statut, role: ligne.role === "admin" ? "admin" : "membre" };
    const derniere = tentativesNotees.get(email) ?? 0;
    if (valeur.statut !== "autorise" && Date.now() - derniere > DELAI_TENTATIVE_MS) {
      tentativesNotees.set(email, Date.now());
      await db
        .update(accesEquipe)
        .set({ derniereTentative: new Date(), clerkUserId: ligne.clerkUserId ?? userId })
        .where(eq(accesEquipe.email, email));
    } else if (!ligne.clerkUserId) {
      await db.update(accesEquipe).set({ clerkUserId: userId }).where(eq(accesEquipe.email, email));
    }
  }

  if (statuts.size > 500) statuts.clear();
  statuts.set(email, { valeur, expire: Date.now() + DUREE_STATUT_MS });
  return valeur;
}

// Point d'entrée unique : appelé par src/proxy.ts (toutes les pages, actions serveur et API du
// back-office), par le layout de l'app et par les routes API qui acceptent un compte connecté.
// Peut lever une erreur (Clerk ou base indisponible) : l'appelant refuse alors l'accès.
export async function statutAcces(userId: string): Promise<AccesEquipe> {
  const id = await identiteClerk(userId);
  if (!id.email || !id.verifie) {
    return { autorise: false, email: id.email, nom: id.nom, role: null, statut: "non_verifie" };
  }
  if (estAdminPermanent(id.email)) {
    return { autorise: true, email: id.email, nom: id.nom, role: "admin", statut: "autorise" };
  }
  const { statut, role } = await statutEnBase(id.email, id.nom, userId);
  return { autorise: statut === "autorise", email: id.email, nom: id.nom, role, statut };
}

// Version qui ne lève jamais : false en cas de doute.
export async function estMembreEquipe(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    return (await statutAcces(userId)).autorise;
  } catch (err) {
    console.error("Contrôle d'accès impossible :", err);
    return false;
  }
}
