import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservationJournal } from "@/db/schema-journal";

// Journal des actions sur les réservations et blocages (voir schema-journal.ts). Écrire dans le
// journal ne doit JAMAIS faire échouer l'action elle-même (créer, supprimer...) : toutes les
// erreurs sont avalées ici et seulement tracées dans les logs Vercel.

// Actions "réservation" historiques (avec suivi Beds24) + tout code libre posé par tracer()
// ("connexion", "paiement_recu", "villa_modifiee"...), le texte lisible étant dans `libelle`.
export type JournalAction = "creation" | "suppression" | "annulation" | "modification_heures" | "fermeture_beds24" | (string & {});
export type Beds24Statut = "ok" | "echec" | "non_concerne";

export type Auteur = { type: "humain" | "systeme"; id: string | null; nom: string; email: string | null };

export const AUTEUR_SYNCHRO_BEDS24: Auteur = { type: "systeme", id: null, nom: "Synchro Beds24 (automatique)", email: null };

export type EntreeJournal = {
  id: string;
  reservationId: string | null;
  villaNom: string | null;
  action: string;
  resume: string | null;
  auteurType: string;
  auteurNom: string | null;
  auteurEmail: string | null;
  beds24Statut: string | null;
  beds24Detail: string | null;
  libelle: string | null;
  categorie: string | null;
  appareil: string | null;
  ip: string | null;
  createdAt: string; // ISO (instant réel, UTC)
};

// Création de la table à la volée (une fois par instance) : pas de migration drizzle-kit à
// lancer à la main sur Neon. Requêtes séparées : l'API HTTP de Neon n'accepte qu'une seule
// instruction par requête.
let tablePrete: Promise<void> | null = null;

export function assurerTableJournal(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS reservation_journal (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reservation_id uuid,
          villa_id uuid,
          villa_nom text,
          action text NOT NULL,
          resume text,
          auteur_type text NOT NULL DEFAULT 'humain',
          auteur_id text,
          auteur_nom text,
          auteur_email text,
          beds24_statut text,
          beds24_detail text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      // Journal élargi (2026-10-18) : colonnes ajoutées à la volée sur la table existante.
      await db.execute(sql`ALTER TABLE reservation_journal ADD COLUMN IF NOT EXISTS libelle text`);
      await db.execute(sql`ALTER TABLE reservation_journal ADD COLUMN IF NOT EXISTS categorie text`);
      await db.execute(sql`ALTER TABLE reservation_journal ADD COLUMN IF NOT EXISTS appareil text`);
      await db.execute(sql`ALTER TABLE reservation_journal ADD COLUMN IF NOT EXISTS ip text`);
      await db.execute(sql`ALTER TABLE reservation_journal ADD COLUMN IF NOT EXISTS session_id text`);
      await db.execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS reservation_journal_connexion_session_idx ON reservation_journal (session_id) WHERE action = 'connexion'`
      );
      await db.execute(sql`CREATE INDEX IF NOT EXISTS reservation_journal_reservation_idx ON reservation_journal (reservation_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS reservation_journal_created_idx ON reservation_journal (created_at)`);
    })().catch((err) => {
      tablePrete = null; // on retentera au prochain appel
      throw err;
    });
  }
  return tablePrete;
}

// D'où vient la requête : IP (en-tête Vercel) et appareil lisible ("iPhone · Safari"). Hors
// contexte de requête (synchro, cron), renvoie du vide.
function appareilLisible(ua: string): string {
  const os = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/i.test(ua)
          ? "Mac"
          : /Windows/i.test(ua)
            ? "Windows"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Appareil inconnu";
  const nav = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome|CriOS/i.test(ua)
        ? "Chrome"
        : /Firefox|FxiOS/i.test(ua)
          ? "Firefox"
          : /Safari/i.test(ua)
            ? "Safari"
            : null;
  return nav ? `${os} · ${nav}` : os;
}

async function origineRequete(): Promise<{ ip: string | null; appareil: string | null }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const ua = h.get("user-agent");
    return { ip, appareil: ua ? appareilLisible(ua) : null };
  } catch {
    return { ip: null, appareil: null };
  }
}

// Utilisateur Clerk connecté qui fait l'action. Jamais d'exception : au pire "inconnu".
export async function auteurConnecte(): Promise<Auteur> {
  try {
    const user = await currentUser();
    if (!user) return { type: "humain", id: null, nom: "Utilisateur inconnu", email: null };
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    const nom = user.fullName?.trim() || user.username || email || "Utilisateur connecté";
    return { type: "humain", id: user.id, nom, email };
  } catch {
    return { type: "humain", id: null, nom: "Utilisateur inconnu", email: null };
  }
}

export async function journaliser(entree: {
  action: JournalAction;
  auteur: Auteur;
  reservationId?: string | null;
  villaId?: string | null;
  villaNom?: string | null;
  resume?: string | null;
  beds24Statut?: Beds24Statut | null;
  beds24Detail?: string | null;
  libelle?: string | null;
  categorie?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    await assurerTableJournal();
    const origine = await origineRequete();
    await getDb()
      .insert(reservationJournal)
      .values({
        reservationId: entree.reservationId ?? null,
        villaId: entree.villaId ?? null,
        villaNom: entree.villaNom ?? null,
        action: entree.action,
        resume: entree.resume ?? null,
        auteurType: entree.auteur.type,
        auteurId: entree.auteur.id,
        auteurNom: entree.auteur.nom,
        auteurEmail: entree.auteur.email,
        beds24Statut: entree.beds24Statut ?? null,
        beds24Detail: entree.beds24Detail ? entree.beds24Detail.slice(0, 500) : null,
        libelle: entree.libelle ?? null,
        categorie: entree.categorie ?? "reservation",
        sessionId: entree.sessionId ?? null,
        appareil: origine.appareil,
        ip: origine.ip,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("Échec écriture journal réservation:", err);
  }
}

type LigneJournal = typeof reservationJournal.$inferSelect;

function versEntree(l: LigneJournal): EntreeJournal {
  return {
    id: l.id,
    reservationId: l.reservationId,
    villaNom: l.villaNom,
    action: l.action,
    resume: l.resume,
    auteurType: l.auteurType,
    auteurNom: l.auteurNom,
    auteurEmail: l.auteurEmail,
    beds24Statut: l.beds24Statut,
    beds24Detail: l.beds24Detail,
    libelle: l.libelle,
    categorie: l.categorie,
    appareil: l.appareil,
    ip: l.ip,
    createdAt: l.createdAt.toISOString(),
  };
}

// Historique complet d'une réservation, du plus ancien au plus récent.
export async function journalDeLaReservation(reservationId: string): Promise<EntreeJournal[]> {
  try {
    await assurerTableJournal();
    const lignes = await getDb()
      .select()
      .from(reservationJournal)
      .where(eq(reservationJournal.reservationId, reservationId))
      .orderBy(reservationJournal.createdAt);
    return lignes.map(versEntree);
  } catch (err) {
    console.error("Lecture journal réservation impossible:", err);
    return [];
  }
}

// Entrée de création de chaque réservation demandée (pour le calendrier : "ajoutée par...").
export async function creationsParReservation(ids: string[]): Promise<Map<string, EntreeJournal>> {
  const parId = new Map<string, EntreeJournal>();
  if (ids.length === 0) return parId;
  try {
    await assurerTableJournal();
    const lignes = await getDb()
      .select()
      .from(reservationJournal)
      .where(and(inArray(reservationJournal.reservationId, ids), eq(reservationJournal.action, "creation")));
    for (const l of lignes) {
      if (l.reservationId && !parId.has(l.reservationId)) parId.set(l.reservationId, versEntree(l));
    }
  } catch (err) {
    console.error("Lecture journal (créations) impossible:", err);
  }
  return parId;
}

// Dernières actions, toutes catégories confondues (page Journal), plus récentes d'abord,
// avec filtres optionnels par personne (email ou nom) et par catégorie.
export async function journalRecent(limite = 300, filtres: { qui?: string; categorie?: string } = {}): Promise<EntreeJournal[]> {
  try {
    await assurerTableJournal();
    const conditions = [];
    if (filtres.qui) {
      conditions.push(sql`(${reservationJournal.auteurEmail} = ${filtres.qui} OR ${reservationJournal.auteurNom} = ${filtres.qui})`);
    }
    if (filtres.categorie) {
      conditions.push(
        filtres.categorie === "reservation"
          ? sql`(${reservationJournal.categorie} = 'reservation' OR ${reservationJournal.categorie} IS NULL)`
          : eq(reservationJournal.categorie, filtres.categorie)
      );
    }
    const lignes = await getDb()
      .select()
      .from(reservationJournal)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(reservationJournal.createdAt))
      .limit(limite);
    return lignes.map(versEntree);
  } catch (err) {
    console.error("Lecture journal impossible:", err);
    return [];
  }
}

// L'app a-t-elle elle-même fermé (avec succès) les nuits de cette réservation sur Beds24 ? Sert à
// ne rouvrir à la suppression QUE des dates que l'app a fermées (ex. résas de l'agent IA créées
// avant le 16/10/2026 : jamais fermées, donc rien à rouvrir — on ne touche pas au calendrier).
export async function datesFermeesParLApp(reservationId: string): Promise<boolean> {
  try {
    await assurerTableJournal();
    const [ligne] = await getDb()
      .select({ id: reservationJournal.id })
      .from(reservationJournal)
      .where(
        and(
          eq(reservationJournal.reservationId, reservationId),
          inArray(reservationJournal.action, ["creation", "fermeture_beds24"]),
          eq(reservationJournal.beds24Statut, "ok")
        )
      )
      .limit(1);
    return Boolean(ligne);
  } catch {
    return false;
  }
}

// Trace n'importe quelle action faite dans l'app ("qui a fait quoi") : à appeler APRÈS que
// l'action a réussi. Ne lève jamais d'erreur. `auteur` n'est à passer que pour une action sans
// compte Clerk (ex. technicien ou propriétaire via lien) ; sinon c'est le compte connecté.
export async function tracer(entree: {
  categorie: string; // rangement/filtre : "reservation", "caisse", "villa", "personnel"...
  action: string; // code court : "solde_recu", "villa_modifiee"...
  libelle: string; // phrase lisible : "Solde reçu"
  resume?: string | null; // détail : voyageur, montant, champ modifié...
  villaId?: string | null;
  villaNom?: string | null;
  reservationId?: string | null;
  auteur?: Auteur;
}): Promise<void> {
  try {
    await journaliser({
      action: entree.action,
      libelle: entree.libelle,
      categorie: entree.categorie,
      resume: entree.resume ?? null,
      villaId: entree.villaId ?? null,
      villaNom: entree.villaNom ?? null,
      reservationId: entree.reservationId ?? null,
      auteur: entree.auteur ?? (await auteurConnecte()),
      beds24Statut: null,
    });
  } catch (err) {
    console.error("Échec traçage action:", err);
  }
}

const connexionsDejaVues = new Set<string>();

// Une ligne "connexion" par session Clerk, à la première page vue (appelé depuis le layout de
// l'app connectée). Le cache mémoire évite une requête SQL à chaque navigation ; l'index unique
// (session_id) protège des doublons entre instances.
export async function enregistrerConnexion(): Promise<void> {
  try {
    const { sessionId, userId } = await auth();
    if (!sessionId || !userId || connexionsDejaVues.has(sessionId)) return;
    connexionsDejaVues.add(sessionId);
    if (connexionsDejaVues.size > 500) connexionsDejaVues.clear();
    await journaliser({
      action: "connexion",
      libelle: "Connexion",
      categorie: "connexion",
      auteur: await auteurConnecte(),
      sessionId,
      beds24Statut: null,
    });
  } catch (err) {
    console.error("Échec enregistrement connexion:", err);
  }
}

// Personnes distinctes ayant une trace dans le journal (filtre "Qui" de la page Journal).
export async function auteursDuJournal(): Promise<{ nom: string; email: string | null }[]> {
  try {
    await assurerTableJournal();
    const lignes = await getDb()
      .selectDistinct({ nom: reservationJournal.auteurNom, email: reservationJournal.auteurEmail })
      .from(reservationJournal)
      .where(eq(reservationJournal.auteurType, "humain"));
    return lignes
      .filter((l): l is { nom: string; email: string | null } => Boolean(l.nom))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  } catch {
    return [];
  }
}
