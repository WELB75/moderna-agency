import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Connexion de la ligne WhatsApp Business de l'agence (+212 6 68 73 09 09) en "coexistence",
// faite depuis la page Accès > WhatsApp (2026-11-05). Le parcours Meta ("Embedded Signup",
// featureType whatsapp_business_app_onboarding) se termine par un scan de QR code avec
// l'application WhatsApp Business du téléphone ; Meta renvoie alors l'identifiant du numéro
// (phone_number_id) et du compte (waba_id), enregistrés ici.
//
// Pourquoi en base plutôt qu'uniquement dans la variable Vercel WHATSAPP_AGENCE_PHONE_NUMBER_ID :
// la connexion marche tout de suite, sans attendre qu'on ajoute la variable et qu'on redéploie.
// La variable, si elle est définie, reste prioritaire.

const GRAPH = "https://graph.facebook.com/v25.0";

// Valeurs publiques (pas des secrets) : app Meta "Moderna IA" et sa configuration
// "Inscription intégrée WhatsApp" créée le 2026-11-05. Surchargées par variables si besoin.
export const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || "1784350132991232";
export const META_ES_CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID?.trim() || "2203052870637521";

export type LigneAgenceConnexion = {
  phoneNumberId: string;
  wabaId: string | null;
  numeroAffiche: string | null;
  nomAffiche: string | null;
  connecteLe: Date;
  connectePar: string | null;
  historiqueDemandeLe: Date | null;
  historiqueErreur: string | null;
};

let tablePrete: Promise<void> | null = null;

function assurerTable(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      await getDb().execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_agence_connexion (
          id integer PRIMARY KEY DEFAULT 1,
          phone_number_id text NOT NULL,
          waba_id text,
          numero_affiche text,
          nom_affiche text,
          connecte_le timestamptz NOT NULL DEFAULT now(),
          connecte_par text,
          historique_demande_le timestamptz,
          historique_erreur text,
          CONSTRAINT whatsapp_agence_connexion_une_ligne CHECK (id = 1)
        )
      `);
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

// Petit cache mémoire : le webhook appelle ceci à chaque événement Meta.
let cache: { at: number; valeur: LigneAgenceConnexion | null } | null = null;
const CACHE_MS = 60_000;

export async function lireConnexionAgence(): Promise<LigneAgenceConnexion | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.valeur;
  await assurerTable();
  const res = await getDb().execute(sql`SELECT * FROM whatsapp_agence_connexion WHERE id = 1`);
  const r = (res.rows?.[0] ?? null) as Record<string, unknown> | null;
  const valeur: LigneAgenceConnexion | null = r
    ? {
        phoneNumberId: String(r.phone_number_id),
        wabaId: (r.waba_id as string | null) ?? null,
        numeroAffiche: (r.numero_affiche as string | null) ?? null,
        nomAffiche: (r.nom_affiche as string | null) ?? null,
        connecteLe: new Date(r.connecte_le as string),
        connectePar: (r.connecte_par as string | null) ?? null,
        historiqueDemandeLe: r.historique_demande_le ? new Date(r.historique_demande_le as string) : null,
        historiqueErreur: (r.historique_erreur as string | null) ?? null,
      }
    : null;
  cache = { at: Date.now(), valeur };
  return valeur;
}

// Identifiant du numéro de la ligne agence : variable Vercel d'abord, sinon la connexion en base.
// Ne lève jamais (le webhook ne doit pas planter si la base est indisponible).
export async function idLigneAgence(): Promise<string | null> {
  const env = process.env.WHATSAPP_AGENCE_PHONE_NUMBER_ID?.trim();
  if (env) return env;
  try {
    return (await lireConnexionAgence())?.phoneNumberId ?? null;
  } catch (err) {
    console.error("[whatsapp-agence] lecture connexion impossible :", err);
    return null;
  }
}

type ReponseGraph = { ok: boolean; data: Record<string, unknown>; erreur: string | null };

async function graph(chemin: string, token: string, init?: { method?: string; body?: unknown }): Promise<ReponseGraph> {
  const res = await fetch(`${GRAPH}/${chemin}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = data.error as { message?: string; error_user_msg?: string; code?: number } | undefined;
  return {
    ok: res.ok && !err,
    data,
    erreur: err ? `${err.error_user_msg ?? err.message ?? "erreur Meta"}${err.code ? ` (code ${err.code})` : ""}` : res.ok ? null : `HTTP ${res.status}`,
  };
}

// Échange du "code" renvoyé par le bouton Meta contre un token métier. Nécessite le secret de
// l'app (META_APP_SECRET) ; sans lui, on se rabat sur le token système déjà utilisé par l'app
// (WHATSAPP_ACCESS_TOKEN), qui a accès au compte WhatsApp Moderna Agency.
async function tokenPourConnexion(code: string | null): Promise<{ token: string | null; note: string | null }> {
  const secret = process.env.META_APP_SECRET?.trim();
  if (code && secret) {
    const url = `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
    if (data.access_token) return { token: data.access_token, note: null };
    console.error("[whatsapp-agence] échange du code Meta :", data.error?.message ?? res.status);
  }
  const systeme = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || null;
  return { token: systeme, note: systeme ? null : "Aucun token Meta disponible (WHATSAPP_ACCESS_TOKEN absent)." };
}

// Demande à Meta d'envoyer les contacts puis l'historique (jusqu'à 6 mois) de l'application
// WhatsApp Business. Possible seulement dans les 24 h qui suivent la connexion ; l'historique
// arrive ensuite par le webhook (champ "history"), traité dans lib/whatsapp-agence.ts.
async function demanderSynchro(phoneNumberId: string, token: string): Promise<string | null> {
  const erreurs: string[] = [];
  for (const sync_type of ["smb_app_state_sync", "history"] as const) {
    const r = await graph(`${phoneNumberId}/smb_app_data`, token, {
      method: "POST",
      body: { messaging_product: "whatsapp", sync_type },
    });
    if (!r.ok) erreurs.push(`${sync_type === "history" ? "historique" : "contacts"} : ${r.erreur}`);
  }
  return erreurs.length ? erreurs.join(" ; ") : null;
}

export type ResultatConnexion = {
  ok: boolean;
  numero: string | null;
  avertissements: string[];
};

export async function connecterLigneAgence(input: {
  code: string | null;
  phoneNumberId: string;
  wabaId: string | null;
  par: string | null;
}): Promise<ResultatConnexion> {
  const phoneNumberId = input.phoneNumberId.trim();
  if (!/^\d{6,30}$/.test(phoneNumberId)) throw new Error("Identifiant de numéro WhatsApp invalide.");
  const wabaId = input.wabaId && /^\d{6,30}$/.test(input.wabaId.trim()) ? input.wabaId.trim() : null;

  const avertissements: string[] = [];
  const { token, note } = await tokenPourConnexion(input.code);
  if (note) avertissements.push(note);

  let numeroAffiche: string | null = null;
  let nomAffiche: string | null = null;
  let historiqueErreur: string | null = null;

  if (token) {
    // L'app doit être abonnée au compte WhatsApp pour recevoir ses webhooks (sans effet si c'est
    // déjà le cas, ce qui est attendu pour le compte Moderna Agency).
    if (wabaId) {
      const abo = await graph(`${wabaId}/subscribed_apps`, token, { method: "POST" });
      if (!abo.ok) avertissements.push(`Abonnement du compte WhatsApp : ${abo.erreur}`);
    }
    const infos = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name`, token);
    if (infos.ok) {
      numeroAffiche = (infos.data.display_phone_number as string | undefined) ?? null;
      nomAffiche = (infos.data.verified_name as string | undefined) ?? null;
    } else {
      avertissements.push(`Lecture du numéro : ${infos.erreur}`);
    }
    historiqueErreur = await demanderSynchro(phoneNumberId, token);
    if (historiqueErreur) avertissements.push(`Import de l'historique : ${historiqueErreur}`);
  }

  await assurerTable();
  await getDb().execute(sql`
    INSERT INTO whatsapp_agence_connexion
      (id, phone_number_id, waba_id, numero_affiche, nom_affiche, connecte_le, connecte_par, historique_demande_le, historique_erreur)
    VALUES (1, ${phoneNumberId}, ${wabaId}, ${numeroAffiche}, ${nomAffiche}, now(), ${input.par}, ${token ? sql`now()` : null}, ${historiqueErreur})
    ON CONFLICT (id) DO UPDATE SET
      phone_number_id = EXCLUDED.phone_number_id,
      waba_id = EXCLUDED.waba_id,
      numero_affiche = EXCLUDED.numero_affiche,
      nom_affiche = EXCLUDED.nom_affiche,
      connecte_le = EXCLUDED.connecte_le,
      connecte_par = EXCLUDED.connecte_par,
      historique_demande_le = EXCLUDED.historique_demande_le,
      historique_erreur = EXCLUDED.historique_erreur
  `);
  cache = null;

  return { ok: true, numero: numeroAffiche, avertissements };
}

// Relance de l'import contacts + historique (bouton de la page, utile si le premier essai a échoué).
export async function relancerSynchroAgence(): Promise<string | null> {
  const connexion = await lireConnexionAgence();
  if (!connexion) throw new Error("La ligne WhatsApp de l'agence n'est pas encore connectée.");
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN absent.");
  const erreur = await demanderSynchro(connexion.phoneNumberId, token);
  await getDb().execute(sql`
    UPDATE whatsapp_agence_connexion SET historique_demande_le = now(), historique_erreur = ${erreur} WHERE id = 1
  `);
  cache = null;
  return erreur;
}
