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
// Administrateurs (« Kamel, Fouad et Imad » gèrent les accès, 2026-10-21) : permanents, toujours
// autorisés et administrateurs, même si la table est vide ou modifiée, pour que personne ne puisse
// fermer la porte à tout le monde.
export const ADMINS_PERMANENTS: { email: string; nom: string }[] = [
  { email: "tmshparis@gmail.com", nom: "Kamel Paris" },
  { email: "jaielfouad@gmail.com", nom: "Fouad Jaiel" },
  // 2026-10-22, Kamel : « ajoute villamodernamarrakech@gmail.com comme admin principal ».
  { email: "villamodernamarrakech@gmail.com", nom: "Imad" },
];

// 2026-10-21 : « il faut autoriser tous ceux qui sont déjà sur l'app (Sanaa, Imad, Imane, Kamel,
// Fouad et Rida) ». Comptes vus dans le journal des connexions, autorisés d'office :
const COMPTES_AUTORISES_INITIAUX: { email: string; nom: string }[] = [
  { email: "modernaagency04@gmail.com", nom: "Imane Haimoudi" },
  { email: "aanas.jaiel@gmail.com", nom: "aanas.jaiel@gmail.com" },
];
// ...et, pour ceux dont l'adresse n'est pas connue ici (Sanaa, Imad, Rida...), tout compte Clerk
// créé avant la mise en place du contrôle est repris comme autorisé (voir repriseComptesExistants).
// Un compte créé après cette date reste en attente jusqu'à validation par un administrateur.
const REPRISE_COMPTES_CREES_AVANT = Date.parse("2026-10-21T20:20:00Z");
const CLE_REPRISE = "reprise_comptes_clerk_2026_10_21";
const LIBELLE_REPRISE = "Compte déjà sur l'app le 21/10";

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
      for (const c of COMPTES_AUTORISES_INITIAUX) {
        await db.execute(sql`
          INSERT INTO acces_equipe (email, nom, role, statut, decide_par, decide_le)
          VALUES (${c.email}, ${c.nom}, 'membre', 'autorise', ${LIBELLE_REPRISE}, now())
          ON CONFLICT (email) DO NOTHING
        `);
      }
      // Sans bloquer l'accès si Clerk ne répond pas : la reprise sera retentée au prochain démarrage
      // (le marqueur n'est posé qu'une fois la reprise terminée).
      await repriseComptesExistants().catch((err) => console.error("Reprise des comptes existants impossible :", err));
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

type UtilisateurClerk = {
  id: string;
  createdAt: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string; verification: { status: string } | null }[];
};

function emailPrincipal(user: UtilisateurClerk): { email: string | null; verifie: boolean } {
  const principale =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0] ?? null;
  return {
    email: principale ? normaliserEmail(principale.emailAddress) : null,
    verifie: principale?.verification?.status === "verified",
  };
}

function nomClerk(user: UtilisateurClerk, email: string | null): string | null {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || email;
}

// Une seule fois (marqueur dans acces_meta) : tous les comptes Clerk existant avant la mise en
// place du contrôle sont autorisés, sauf décision contraire déjà prise dans la page Accès. Ils
// restent visibles dans la page Accès, où un administrateur peut retirer un compte inconnu.
async function repriseComptesExistants(): Promise<void> {
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS acces_meta (cle text PRIMARY KEY, fait_le timestamptz NOT NULL DEFAULT now())`);
  const deja = await db.execute(sql`SELECT 1 FROM acces_meta WHERE cle = ${CLE_REPRISE} LIMIT 1`);
  if (deja.rows.length > 0) return;

  const client = await clerkClient();
  const comptes: UtilisateurClerk[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = (await client.users.getUserList({ limit: 100, offset })) as unknown;
    const page = (Array.isArray(res) ? res : (res as { data: UtilisateurClerk[] }).data) as UtilisateurClerk[];
    comptes.push(...page);
    if (page.length < 100) break;
  }

  for (const user of comptes) {
    if (!(user.createdAt < REPRISE_COMPTES_CREES_AVANT)) continue;
    const { email, verifie } = emailPrincipal(user);
    if (!email || !verifie || estAdminPermanent(email)) continue;
    await db.execute(sql`
      INSERT INTO acces_equipe (email, nom, role, statut, clerk_user_id, decide_par, decide_le)
      VALUES (${email}, ${nomClerk(user, email)}, 'membre', 'autorise', ${user.id}, ${LIBELLE_REPRISE}, now())
      ON CONFLICT (email) DO UPDATE SET
        statut = 'autorise',
        nom = COALESCE(acces_equipe.nom, EXCLUDED.nom),
        clerk_user_id = COALESCE(acces_equipe.clerk_user_id, EXCLUDED.clerk_user_id),
        decide_par = EXCLUDED.decide_par,
        decide_le = now()
      WHERE acces_equipe.decide_par IS NULL
    `);
  }
  await db.execute(sql`INSERT INTO acces_meta (cle) VALUES (${CLE_REPRISE}) ON CONFLICT (cle) DO NOTHING`);
}

// --- Identité Clerk (e-mail vérifié + nom), mise en cache pour ne pas appeler Clerk à chaque page.

type Identite = { email: string | null; nom: string | null; verifie: boolean };
const DUREE_IDENTITE_MS = 10 * 60 * 1000;
const identites = new Map<string, { valeur: Identite; expire: number }>();

async function identiteClerk(userId: string): Promise<Identite> {
  const enCache = identites.get(userId);
  if (enCache && enCache.expire > Date.now()) return enCache.valeur;

  const client = await clerkClient();
  const user = (await client.users.getUser(userId)) as unknown as UtilisateurClerk;
  const { email, verifie } = emailPrincipal(user);
  const valeur: Identite = { email, nom: nomClerk(user, email), verifie };

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
