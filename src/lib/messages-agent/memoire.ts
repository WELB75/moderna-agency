import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { subDays } from "date-fns";
import { getDb } from "@/db";
import { reservations, villas, whatsappOutboundMessages } from "@/db/schema";
import { agentMemoireBrut, agentMemoireFiches, agentMemoireFils, agentMemoireThemes } from "@/db/schema-memoire-agent";
import { beds24GetBookings, beds24GetMessagesBulk, type Beds24Message } from "@/lib/beds24/client";
import { normaliseCanal } from "@/lib/canal";
import { LIGNE_AGENCE } from "@/lib/whatsapp-agence";
import { anonymiser, calculerConnaissances, libelleTheme, THEMES_EXTRACTION, type Connaissances, type FicheMemoire, type ThemeCode } from "./memoire-regles";

// Mémoire de l'agent IA de la boîte de réception — Kamel, 2026-10-26 : "reprendre tout ce que les
// clients disent, tout ce qu'ils demandent et tout ce qu'on leur répond pour alimenter la mémoire
// de l'agent IA".
//
//  1. Les fils Airbnb / Booking.com sont lus via Beds24 (par lots, pour ménager le quota), ainsi que
//     les conversations clients de la ligne WhatsApp Business de l'agence (copie de tout ce qui
//     passe sur le téléphone, y compris l'historique importé à la connexion).
//  2. Claude (Haiku) en tire des échanges "question du voyageur -> réponse de l'équipe", puis ils
//     sont anonymisés (noms, téléphones, emails, liens, codes) avant d'être stockés.
//  3. Claude (Sonnet) consolide les échanges d'un thème en quelques fiches propres, en préférant
//     les réponses les plus récentes. Les fiches écrites ou corrigées à la main ne sont jamais
//     réécrites ; celles désactivées ne sont pas recréées.
//  4. À chaque brouillon, l'agent reçoit les fiches générales + celles du logement du séjour.

const client = new Anthropic();

const LOT_TOUT = 50; // fils lus par appel en mode "tout" (un appel groupé Beds24)
const FENETRE_RECENTS_JOURS = 60;
const MAX_ANALYSES_PAR_APPEL = 60;
const CONCURRENCE_ANALYSE = 6;
const MAX_ENTREES_CONSOLIDATION = 80;

let tablesPretes: Promise<void> | null = null;

// Création à la volée (une fois par instance), une instruction par requête : l'API HTTP de Neon
// n'en accepte qu'une. Même principe que assurerTableJournal.
export function assurerTablesMemoire(): Promise<void> {
  if (!tablesPretes) {
    tablesPretes = (async () => {
      const db = getDb();
      await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_memoire_fils (
        booking_id bigint PRIMARY KEY, villa_nom text, canal text, nb_messages integer NOT NULL DEFAULT 0,
        statut text NOT NULL DEFAULT 'analyse', analyse_at timestamptz NOT NULL DEFAULT now())`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_memoire_brut (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id bigint NOT NULL, theme text NOT NULL,
        question text NOT NULL, reponse text NOT NULL, villa_nom text, canal text, date_echange timestamptz,
        created_at timestamptz NOT NULL DEFAULT now())`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS agent_memoire_brut_booking_idx ON agent_memoire_brut (booking_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS agent_memoire_brut_theme_idx ON agent_memoire_brut (theme)`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_memoire_fiches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), theme text NOT NULL, titre text NOT NULL, question text NOT NULL,
        reponse text NOT NULL, villa_nom text, actif boolean NOT NULL DEFAULT true, epingle boolean NOT NULL DEFAULT false,
        nb_sources integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS agent_memoire_themes (theme text PRIMARY KEY, consolide_at timestamptz NOT NULL)`);
    })().catch((err) => {
      tablesPretes = null;
      throw err;
    });
  }
  return tablesPretes;
}

// ---------- 1. Fils à lire ----------

type FilCandidat = { bookingId: number; villaNom: string | null; canal: string | null; noms: string[] };

async function candidats(mode: "tout" | "recents"): Promise<Map<number, FilCandidat>> {
  const db = getDb();
  const rows = await db
    .select({ beds24BookingId: reservations.beds24BookingId, guestName: reservations.guestName, canal: reservations.canal, villaNom: villas.nom })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(
      and(
        isNotNull(reservations.beds24BookingId),
        mode === "recents" ? gte(reservations.checkIn, subDays(new Date(), FENETRE_RECENTS_JOURS)) : undefined
      )
    );

  const parId = new Map<number, FilCandidat>();
  for (const r of rows) {
    const canal = normaliseCanal(r.canal);
    if (canal !== "airbnb" && canal !== "booking") continue; // les fils n'existent que pour les canaux OTA
    const id = Number(r.beds24BookingId);
    if (Number.isFinite(id) && id > 0) parId.set(id, { bookingId: id, villaNom: r.villaNom, canal: r.canal, noms: [r.guestName] });
  }

  // Demandes d'information (pas encore de réservation en base) : Beds24 seulement. Best effort.
  try {
    const demandes = await beds24GetBookings({ status: ["inquiry", "request"] });
    if (demandes.length > 0) {
      const logements = await db.select({ nom: villas.nom, roomId: villas.beds24RoomId }).from(villas).where(isNotNull(villas.beds24RoomId));
      const nomParRoom = new Map(logements.map((l) => [String(l.roomId), l.nom]));
      for (const d of demandes) {
        if (parId.has(d.id)) continue;
        parId.set(d.id, { bookingId: d.id, villaNom: nomParRoom.get(String(d.roomId)) ?? null, canal: "demande", noms: [`${d.firstName ?? ""} ${d.lastName ?? ""}`.trim()] });
      }
    }
  } catch (err) {
    console.error("Mémoire agent : demandes d'information illisibles:", err);
  }
  return parId;
}

// Conversations de la ligne WhatsApp Business de l'agence (clients, voir whatsapp-agence.ts) : même
// traitement que les fils Airbnb / Booking.com. L'identifiant d'un fil est négatif (dérivé du
// numéro) pour ne jamais croiser un identifiant de réservation Beds24.
function idFilWhatsapp(numero: string): number {
  return -Number(numero.replace(/\D/g, "").slice(-12));
}

async function filsWhatsappAgence(mode: "tout" | "recents"): Promise<Map<number, { fil: FilCandidat; messages: Beds24Message[] }>> {
  const rows = await getDb()
    .select({ numero: whatsappOutboundMessages.destinataire, sens: whatsappOutboundMessages.sens, contenu: whatsappOutboundMessages.contenu, at: whatsappOutboundMessages.createdAt })
    .from(whatsappOutboundMessages)
    .where(and(eq(whatsappOutboundMessages.ligne, LIGNE_AGENCE), eq(whatsappOutboundMessages.canal, "texte")))
    .orderBy(whatsappOutboundMessages.createdAt);

  const parNumero = new Map<string, Beds24Message[]>();
  for (const r of rows) {
    const texte = r.contenu.trim();
    if (!texte || texte.startsWith("[")) continue; // médias et réactions : juste un libellé
    const liste = parNumero.get(r.numero) ?? [];
    liste.push({ id: liste.length, bookingId: 0, time: r.at.toISOString(), read: true, message: texte, source: r.sens === "entrant" ? "guest" : "host" });
    parNumero.set(r.numero, liste);
  }

  const limite = subDays(new Date(), FENETRE_RECENTS_JOURS).getTime();
  const fils = new Map<number, { fil: FilCandidat; messages: Beds24Message[] }>();
  for (const [numero, messages] of parNumero) {
    if (mode === "recents" && new Date(messages[messages.length - 1].time).getTime() < limite) continue;
    const id = idFilWhatsapp(numero);
    messages.forEach((m) => (m.bookingId = id));
    fils.set(id, { fil: { bookingId: id, villaNom: null, canal: "WhatsApp", noms: [] }, messages });
  }
  return fils;
}

// ---------- 2. Extraction d'un fil ----------

const EchangesSchema = z.object({
  echanges: z.array(
    z.object({
      theme: z.enum(THEMES_EXTRACTION as [ThemeCode, ...ThemeCode[]]),
      question: z.string().describe("La demande du voyageur, reformulée en français, générique et sans donnée personnelle."),
      reponse: z.string().describe("Ce que l'équipe a répondu, en français, sans donnée personnelle, avec les faits utiles (prix, horaires, règles)."),
      specifique_logement: z.boolean().describe("true seulement si la réponse dépend de CE logement (équipement, taille, emplacement), pas d'une règle générale de l'agence."),
    })
  ),
});

type EchangeBrut = z.infer<typeof EchangesSchema>["echanges"][number];

function filTexte(messages: Beds24Message[]): string {
  return messages
    .slice(-40)
    .map((m) => `${m.source === "guest" ? "Voyageur" : "Équipe"} : ${m.message.trim().slice(0, 1200)}`)
    .join("\n\n");
}

async function extraireEchanges(fil: FilCandidat, messages: Beds24Message[]): Promise<EchangeBrut[]> {
  const out = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: zodOutputFormat(EchangesSchema) },
    system: `Tu analyses une conversation entre un voyageur et l'équipe de Moderna Agency (conciergerie de villas et appartements à Marrakech), sur Airbnb, Booking.com ou WhatsApp. Tu extrais ce qui servira à répondre à d'autres voyageurs.

Pour chaque question ou demande du voyageur à laquelle l'ÉQUIPE a réellement répondu, produis un échange : la demande et la réponse donnée, en français (traduis si la conversation est dans une autre langue).

Règles :
- N'inclus JAMAIS de nom ou prénom, téléphone, email, lien, code d'accès, code wifi, numéro de réservation ni date précise de séjour : remplace par une formulation générique ("le voyageur", "à votre arrivée").
- Garde les faits réutilisables : prix, horaires, conditions, règles, ce que l'équipe propose ou refuse, et la manière dont elle le formule.
- Ignore : les messages automatiques ou modèles (bienvenue, instructions d'arrivée, codes), les simples remerciements, les demandes restées sans réponse de l'équipe, et les réponses sans contenu réutilisable ("je vérifie et je reviens vers vous").
- N'invente rien : ne rapporte que ce que l'équipe a écrit.
- Si rien n'est exploitable, renvoie une liste vide.`,
    messages: [
      {
        role: "user",
        content: `Logement : ${fil.villaNom ?? "non précisé"}. Canal : ${fil.canal ?? "non précisé"}.\n\nConversation (du plus ancien au plus récent) :\n\n${filTexte(messages)}`,
      },
    ],
  });
  return out.parsed_output?.echanges ?? [];
}

async function enParallele<T>(elements: T[], concurrence: number, tache: (el: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrence, elements.length) }, async () => {
      while (i < elements.length) {
        const el = elements[i++];
        await tache(el);
      }
    })
  );
}

export type BilanApprentissage = { analyses: number; vides: number; erreurs: number; echanges: number; restants: number };

// Lit un lot de fils et enregistre leurs échanges. "tout" : tous les fils jamais lus (à répéter
// tant que `restants` > 0). "recents" : fils des séjours récents, relus seulement si de nouveaux
// messages sont arrivés — c'est ce que fait le cron quotidien.
export async function apprendreLot(mode: "tout" | "recents"): Promise<BilanApprentissage> {
  await assurerTablesMemoire();
  const db = getDb();
  const bilan: BilanApprentissage = { analyses: 0, vides: 0, erreurs: 0, echanges: 0, restants: 0 };

  const cands = await candidats(mode);
  const whatsapp = await filsWhatsappAgence(mode);
  for (const [id, w] of whatsapp) cands.set(id, w.fil);
  const connus = new Map<number, { nb: number; statut: string }>();
  const ilYA12h = Date.now() - 12 * 3600 * 1000;
  for (const f of await db.select().from(agentMemoireFils)) {
    // Un fil resté "vide" (pas encore de réponse de l'équipe) est relu plus tard : il peut avoir reçu des messages.
    if (f.statut === "vide" && f.analyseAt.getTime() < ilYA12h) continue;
    connus.set(f.bookingId, { nb: f.nbMessages, statut: f.statut });
  }

  let aLire = [...cands.keys()];
  if (mode === "tout") {
    // Les fils en erreur ne sont pas retentés ici (sinon la boucle ne finirait jamais) : le cron "recents" le fait.
    aLire = aLire.filter((id) => !connus.has(id));
    bilan.restants = Math.max(0, aLire.length - LOT_TOUT);
    aLire = aLire.slice(0, LOT_TOUT);
  }
  if (aLire.length === 0) return bilan;

  const messagesParFil = await beds24GetMessagesBulk(aLire.filter((id) => id > 0));
  for (const id of aLire) if (id < 0) messagesParFil.set(id, whatsapp.get(id)?.messages ?? []);

  type ATraiter = { fil: FilCandidat; messages: Beds24Message[] };
  const aAnalyser: ATraiter[] = [];
  const videsOuInchanges: { id: number; nb: number; vide: boolean }[] = [];

  for (const id of aLire) {
    const fil = cands.get(id)!;
    const messages = (messagesParFil.get(id) ?? [])
      .filter((m) => (m.source === "guest" || m.source === "host") && (m.message ?? "").trim())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const nb = messages.length;
    if (mode === "recents" && connus.get(id)?.nb === nb && connus.get(id)?.statut !== "erreur") continue; // rien de neuf
    const echangeable = messages.some((m) => m.source === "guest") && messages.some((m) => m.source === "host");
    if (!echangeable) videsOuInchanges.push({ id, nb, vide: true });
    else aAnalyser.push({ fil, messages });
  }

  if (videsOuInchanges.length > 0) {
    await db
      .insert(agentMemoireFils)
      .values(videsOuInchanges.map((v) => ({ bookingId: v.id, villaNom: cands.get(v.id)?.villaNom ?? null, canal: cands.get(v.id)?.canal ?? null, nbMessages: v.nb, statut: "vide" })))
      .onConflictDoUpdate({
        target: agentMemoireFils.bookingId,
        set: { nbMessages: sql`excluded.nb_messages`, statut: "vide", analyseAt: new Date() },
      });
    bilan.vides = videsOuInchanges.length;
  }

  if (mode === "recents" && aAnalyser.length > MAX_ANALYSES_PAR_APPEL) {
    bilan.restants = aAnalyser.length - MAX_ANALYSES_PAR_APPEL;
    aAnalyser.length = MAX_ANALYSES_PAR_APPEL;
  }

  await enParallele(aAnalyser, CONCURRENCE_ANALYSE, async ({ fil, messages }) => {
    try {
      const echanges = await extraireEchanges(fil, messages);
      const dateEchange = new Date(messages[messages.length - 1].time);
      const lignes = echanges
        .map((e) => ({
          bookingId: fil.bookingId,
          theme: e.theme,
          question: anonymiser(e.question.trim(), fil.noms),
          reponse: anonymiser(e.reponse.trim(), fil.noms),
          villaNom: e.specifique_logement ? fil.villaNom : null,
          canal: fil.canal,
          dateEchange: Number.isNaN(dateEchange.getTime()) ? null : dateEchange,
        }))
        .filter((l) => l.question.length > 3 && l.reponse.length > 3);

      // Relecture d'un fil déjà connu : on remplace ses anciens échanges, et les thèmes touchés
      // sont à reconsolider.
      const anciens = await db.delete(agentMemoireBrut).where(eq(agentMemoireBrut.bookingId, fil.bookingId)).returning({ theme: agentMemoireBrut.theme });
      if (anciens.length > 0) {
        await db.update(agentMemoireThemes).set({ consolideAt: new Date(0) }).where(inArray(agentMemoireThemes.theme, [...new Set(anciens.map((a) => a.theme))]));
      }
      if (lignes.length > 0) await db.insert(agentMemoireBrut).values(lignes);
      await db
        .insert(agentMemoireFils)
        .values({ bookingId: fil.bookingId, villaNom: fil.villaNom, canal: fil.canal, nbMessages: messages.length, statut: "analyse" })
        .onConflictDoUpdate({ target: agentMemoireFils.bookingId, set: { nbMessages: messages.length, statut: "analyse", analyseAt: new Date() } });
      bilan.analyses += 1;
      bilan.echanges += lignes.length;
    } catch (err) {
      console.error(`Mémoire agent : analyse du fil ${fil.bookingId} impossible:`, err);
      await db
        .insert(agentMemoireFils)
        .values({ bookingId: fil.bookingId, villaNom: fil.villaNom, canal: fil.canal, nbMessages: 0, statut: "erreur" })
        .onConflictDoUpdate({ target: agentMemoireFils.bookingId, set: { statut: "erreur", analyseAt: new Date() } });
      bilan.erreurs += 1;
    }
  });

  return bilan;
}

// ---------- 3. Consolidation ----------

const FichesSchema = z.object({
  fiches: z.array(
    z.object({
      titre: z.string().describe("Titre court de la fiche."),
      question: z.string().describe("La question type d'un voyageur."),
      reponse: z.string().describe("La réponse type de l'équipe, prête à servir de base à un message."),
      logement: z.string().nullable().describe("Nom exact du logement si la fiche ne vaut que pour lui, sinon null."),
      nb_sources: z.number().int().describe("Nombre d'échanges d'origine que cette fiche résume."),
    })
  ),
});

const mois = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : "date inconnue");

// Thèmes dont des échanges sont plus récents que la dernière consolidation ("style" compris dès
// que n'importe quel échange est nouveau).
export async function themesAConsolider(): Promise<string[]> {
  await assurerTablesMemoire();
  const db = getDb();
  const sales = await db.execute(sql`
    SELECT b.theme FROM agent_memoire_brut b
    LEFT JOIN agent_memoire_themes t ON t.theme = b.theme
    GROUP BY b.theme, t.consolide_at
    HAVING max(b.created_at) > coalesce(t.consolide_at, 'epoch')`);
  const themes = (sales.rows as { theme: string }[]).map((r) => r.theme);
  const style = await db.execute(sql`
    SELECT 1 FROM agent_memoire_brut b WHERE b.created_at > coalesce((SELECT consolide_at FROM agent_memoire_themes WHERE theme = 'style'), 'epoch') LIMIT 1`);
  if (style.rows.length > 0) themes.push("style");
  return themes;
}

export async function consoliderTheme(theme: string): Promise<number> {
  await assurerTablesMemoire();
  const db = getDb();
  const estStyle = theme === "style";

  const entrees = await db
    .select()
    .from(agentMemoireBrut)
    .where(estStyle ? undefined : eq(agentMemoireBrut.theme, theme))
    .orderBy(desc(agentMemoireBrut.dateEchange))
    .limit(MAX_ENTREES_CONSOLIDATION);

  const existantes = await db.select().from(agentMemoireFiches).where(eq(agentMemoireFiches.theme, theme));
  const remplacables = existantes.filter((f) => !f.epingle && f.actif).map((f) => f.id);
  const protegees = existantes.filter((f) => f.epingle && f.actif);
  const refusees = existantes.filter((f) => !f.actif);

  const marque = async () =>
    db
      .insert(agentMemoireThemes)
      .values({ theme, consolideAt: new Date() })
      .onConflictDoUpdate({ target: agentMemoireThemes.theme, set: { consolideAt: new Date() } });

  if (entrees.length === 0) {
    await marque();
    return 0;
  }

  const logementsConnus = new Set(entrees.map((e) => e.villaNom).filter((v): v is string => Boolean(v)));
  const liste = entrees
    .map((e) =>
      estStyle
        ? `- ${e.reponse.slice(0, 400)}`
        : `- (${mois(e.dateEchange)}${e.villaNom ? `, ${e.villaNom}` : ""}) Question : ${e.question.slice(0, 400)} | Réponse : ${e.reponse.slice(0, 500)}`
    )
    .join("\n");

  const consigne = estStyle
    ? `Voici des réponses réelles de l'équipe de Moderna Agency à des voyageurs. Décris en UNE seule fiche la façon d'écrire de l'équipe : formules d'accueil et de politesse, niveau de familiarité, longueur habituelle, structure, formule de fin ou signature, ce qu'elle évite. La "question" de la fiche vaut "Comment l'équipe écrit-elle aux voyageurs ?" et la "reponse" est ce guide de style, avec 2 ou 3 courts exemples de formulations typiques.`
    : `Voici des échanges réels entre des voyageurs et l'équipe de Moderna Agency sur le thème « ${libelleTheme(theme)} ». Fusionne-les en 3 à 10 fiches distinctes (une par sujet précis), sans doublon. Pour chaque sujet : une question type et la réponse type de l'équipe, fidèle à ce qu'elle dit vraiment (prix, horaires, conditions, règles, ton).
Si des réponses se contredisent (ex. un prix qui a changé), garde la plus récente. N'invente rien. Ne rapporte aucune donnée personnelle ni aucun code. Une fiche ne vaut pour un logement précis (champ "logement") que si les échanges d'origine sont propres à ce logement ; sinon laisse null. Logements possibles : ${[...logementsConnus].join(", ") || "aucun"}.`;

  const contexte =
    (protegees.length > 0 ? `\nFiches déjà validées à la main (ne les redouble pas) :\n${protegees.map((f) => `- ${f.titre}`).join("\n")}\n` : "") +
    (refusees.length > 0 ? `\nSujets refusés par l'équipe (ne les recrée pas) :\n${refusees.map((f) => `- ${f.titre}`).join("\n")}\n` : "");

  const out = await client.messages.parse({
    // Même modèle que les autres usages Sonnet de l'app : claude-sonnet-5-5 refuse thinking "disabled".
    model: "claude-sonnet-5",
    max_tokens: 6000,
    thinking: { type: "disabled" },
    output_config: { effort: "medium", format: zodOutputFormat(FichesSchema) },
    system: consigne,
    messages: [{ role: "user", content: `${contexte}\nÉchanges (du plus récent au plus ancien) :\n${liste}` }],
  });

  const fiches = (out.parsed_output?.fiches ?? []).slice(0, estStyle ? 1 : 12);
  if (fiches.length === 0) {
    // Pas de résultat exploitable : on garde les fiches actuelles et on ne marque pas le thème.
    return 0;
  }

  const lignes = fiches.map((f) => ({
    theme,
    titre: anonymiser(f.titre.trim()),
    question: anonymiser(f.question.trim()),
    reponse: anonymiser(f.reponse.trim()),
    villaNom: f.logement && logementsConnus.has(f.logement) ? f.logement : null,
    nbSources: Math.max(1, f.nb_sources),
  }));
  await db.insert(agentMemoireFiches).values(lignes);
  if (remplacables.length > 0) await db.delete(agentMemoireFiches).where(inArray(agentMemoireFiches.id, remplacables));
  await marque();
  return lignes.length;
}

// ---------- 4. Lecture pour l'agent ----------

// Fiches actives. Jamais d'erreur remontée : sans mémoire, l'agent répond comme avant.
export async function fichesPourAgent(): Promise<FicheMemoire[]> {
  try {
    await assurerTablesMemoire();
    const rows = await getDb().select().from(agentMemoireFiches).where(eq(agentMemoireFiches.actif, true));
    return rows.map((f) => ({ id: f.id, theme: f.theme, titre: f.titre, question: f.question, reponse: f.reponse, villaNom: f.villaNom, nbSources: f.nbSources }));
  } catch (err) {
    console.error("Mémoire agent : lecture impossible:", err);
    return [];
  }
}

export async function statsMemoire(): Promise<{ fils: number; filsAnalyses: number; echanges: number; fiches: number; fichesActives: number; derniere: Date | null }> {
  await assurerTablesMemoire();
  const db = getDb();
  const [r] = (
    await db.execute(sql`
      SELECT (SELECT count(*) FROM agent_memoire_fils)::int AS fils,
             (SELECT count(*) FROM agent_memoire_fils WHERE statut = 'analyse')::int AS fils_analyses,
             (SELECT count(*) FROM agent_memoire_brut)::int AS echanges,
             (SELECT count(*) FROM agent_memoire_fiches)::int AS fiches,
             (SELECT count(*) FROM agent_memoire_fiches WHERE actif)::int AS fiches_actives,
             (SELECT max(analyse_at) FROM agent_memoire_fils) AS derniere`)
  ).rows as { fils: number; fils_analyses: number; echanges: number; fiches: number; fiches_actives: number; derniere: string | null }[];
  return { fils: r.fils, filsAnalyses: r.fils_analyses, echanges: r.echanges, fiches: r.fiches, fichesActives: r.fiches_actives, derniere: r.derniere ? new Date(r.derniere) : null };
}


// Niveaux de connaissance par sujet (voir calculerConnaissances) : échanges réels les plus récents
// (plafonnés pour rester léger) et fiches actives.
export async function connaissancesAgent(): Promise<Connaissances> {
  await assurerTablesMemoire();
  const db = getDb();
  const [echanges, fiches] = await Promise.all([
    db
      .select({ question: agentMemoireBrut.question, reponse: agentMemoireBrut.reponse, at: agentMemoireBrut.createdAt })
      .from(agentMemoireBrut)
      .orderBy(desc(agentMemoireBrut.createdAt))
      .limit(5000),
    db.select().from(agentMemoireFiches).where(eq(agentMemoireFiches.actif, true)),
  ]);
  return calculerConnaissances(fiches, echanges);
}
