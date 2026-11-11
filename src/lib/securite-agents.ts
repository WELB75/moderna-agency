import { and, asc, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { getDb } from "@/db";
import { domaines, reservations, villas, whatsappOutboundMessages } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { phonesMatch } from "@/lib/phone";
import { sendWhatsAppTemplate } from "@/lib/whatsapp-agent/send";
import { notifierKamelTelegram } from "@/lib/telegram";
import { MODELE_SECURITE } from "@/lib/securite-envois-util";
import { getOuvertures, type OuvertureSecurite } from "@/lib/securite-ouvertures";

// Agents de sécurité par domaine (Kamel, 2026-11-06 : « il me faut un espace pour visualiser que
// l'envoi a bien été fait aux différents agents de sécurité »). Un domaine peut avoir plusieurs
// gardiens (équipes jour / nuit...) : chacun reçoit le modèle Meta « securite_arrivee_invite ».
// L'ancien numéro unique `domaines.securite_phone` reste pris en compte comme premier agent.
export { MODELE_SECURITE };
const RE_RESA = /\/securite\/villa\/([0-9a-f-]{36})/i;

export type AgentSecurite = {
  id: string | null; // null = numéro historique du domaine (domaines.securite_phone)
  domaineId: string;
  nom: string;
  phone: string;
};

let tablePrete: Promise<void> | null = null;

export function assurerTableAgentsSecurite(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      await getDb().execute(sql`
        CREATE TABLE IF NOT EXISTS securite_agents (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          domaine_id uuid NOT NULL,
          nom text NOT NULL,
          phone text NOT NULL,
          actif boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

// Format international avec « + » (celui du journal WhatsApp) : "06..." → "+2126...".
export function normaliserTelephone(raw: string): string {
  let n = raw.replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  else if (n.startsWith("0")) n = `+212${n.slice(1)}`;
  else if (!n.startsWith("+")) n = n.length > 9 ? `+${n}` : `+212${n}`;
  return n;
}

export async function getAgentsSecurite(domaineIds: string[]): Promise<Map<string, AgentSecurite[]>> {
  const parDomaine = new Map<string, AgentSecurite[]>(domaineIds.map((id) => [id, []]));
  if (domaineIds.length === 0) return parDomaine;
  await assurerTableAgentsSecurite();
  const db = getDb();
  const [historiques, lignes] = await Promise.all([
    db.select({ id: domaines.id, phone: domaines.securitePhone }).from(domaines).where(inArray(domaines.id, domaineIds)),
    db.execute<{ id: string; domaine_id: string; nom: string; phone: string }>(sql`
      SELECT id, domaine_id, nom, phone FROM securite_agents
      WHERE actif = true AND domaine_id IN (${sql.join(domaineIds.map((id) => sql`${id}::uuid`), sql`, `)})
      ORDER BY created_at ASC
    `),
  ]);
  for (const h of historiques) {
    if (h.phone) parDomaine.get(h.id)?.push({ id: null, domaineId: h.id, nom: "Gardien principal", phone: normaliserTelephone(h.phone) });
  }
  for (const l of lignes.rows) {
    const liste = parDomaine.get(l.domaine_id);
    if (!liste) continue;
    const phone = normaliserTelephone(l.phone);
    const doublon = liste.find((a) => phonesMatch(a.phone, phone));
    // Le numéro historique déjà saisi comme agent nommé : on garde le nom donné.
    if (doublon && doublon.id === null) Object.assign(doublon, { id: l.id, nom: l.nom });
    else if (!doublon) liste.push({ id: l.id, domaineId: l.domaine_id, nom: l.nom, phone });
  }
  return parDomaine;
}

export async function ajouterAgentSecurite(domaineId: string, nom: string, phone: string): Promise<void> {
  await assurerTableAgentsSecurite();
  await getDb().execute(sql`
    INSERT INTO securite_agents (domaine_id, nom, phone) VALUES (${domaineId}::uuid, ${nom}, ${normaliserTelephone(phone)})
  `);
}

// Retirer un agent : désactivé (pas supprimé) pour que le journal des envois garde son nom.
// Le numéro historique du domaine (id null) se retire en le vidant sur le domaine.
export async function retirerAgentSecurite(agent: { id: string | null; domaineId: string }): Promise<void> {
  await assurerTableAgentsSecurite();
  const db = getDb();
  if (agent.id) {
    await db.execute(sql`UPDATE securite_agents SET actif = false WHERE id = ${agent.id}::uuid`);
  } else {
    await db.update(domaines).set({ securitePhone: null }).where(eq(domaines.id, agent.domaineId));
  }
}

export type ResultatEnvoiSecurite = { agent: string; phone: string; ok: boolean };

// Envoie le modèle Meta à TOUS les agents du domaine de la réservation. Utilisé par l'envoi
// automatique (fiche + contrat validés) et par le bouton « Envoyer à la sécurité » (envoi forcé,
// même avec une fiche partielle). Chaque envoi est journalisé dans whatsapp_outbound_messages,
// dont le statut (envoyé / délivré / lu / échec) est mis à jour par le webhook Meta.
export async function envoyerSecuriteReservation(
  reservationId: string,
  mode: "auto" | "manuel"
): Promise<{ resultats: ResultatEnvoiSecurite[]; erreur?: string }> {
  const db = getDb();
  const [r] = await db
    .select({
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      status: reservations.status,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      domaineId: villas.domaineId,
    })
    .from(reservations)
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return { resultats: [], erreur: "Réservation introuvable." };
  if (r.status === "annulee") return { resultats: [], erreur: "Réservation annulée." };
  if (!r.domaineId || !r.villaNom) return { resultats: [], erreur: "Logement sans domaine." };

  const agents = (await getAgentsSecurite([r.domaineId])).get(r.domaineId) ?? [];
  if (agents.length === 0) return { resultats: [], erreur: "Aucun agent de sécurité renseigné pour ce domaine." };

  const date = r.checkIn.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const lien = `${getBaseUrl()}/securite/villa/${reservationId}`;
  const params = [r.guestName, r.villaNom, r.villaNumero ?? "", date, lien];
  const resultats = await Promise.all(
    agents.map(async (a) => ({
      agent: a.nom,
      phone: a.phone,
      ok: await sendWhatsAppTemplate(a.phone, MODELE_SECURITE, "ar", params, `securite_${mode}`),
    }))
  );
  await notifierEnvoiSecuriteTelegram({
    guestName: r.guestName,
    villaNom: r.villaNom,
    villaNumero: r.villaNumero,
    domaineId: r.domaineId,
    date,
    mode,
    resultats,
  });
  return { resultats };
}

// Telegram à chaque envoi du message sécurité (Kamel, 2026-11-07 : « une notification quand le
// message WhatsApp est parti à la sécurité »), automatique ou manuel, pour tous les domaines. « Envoyé »
// = accepté par WhatsApp ; la remise et la lecture se suivent dans Sécurité → Suivi. Un échec est
// signalé aussi : l'envoi automatique est réessayé au prochain événement, pas avant.
async function notifierEnvoiSecuriteTelegram(x: {
  guestName: string;
  villaNom: string;
  villaNumero: string | null;
  domaineId: string;
  date: string;
  mode: "auto" | "manuel";
  resultats: ResultatEnvoiSecurite[];
}): Promise<void> {
  try {
    const [d] = await getDb().select({ nom: domaines.nom }).from(domaines).where(eq(domaines.id, x.domaineId)).limit(1);
    const reussis = x.resultats.filter((a) => a.ok);
    const echecs = x.resultats.filter((a) => !a.ok);
    const entete = reussis.length > 0 ? "Message sécurité envoyé sur WhatsApp" : "Échec de l'envoi du message sécurité";
    const lignes = [
      `${entete} (${x.mode === "auto" ? "automatique" : "manuel"})`,
      `${x.guestName} · ${x.villaNom}${x.villaNumero ? ` n°${x.villaNumero}` : ""} · arrivée ${x.date}`,
      d ? `Domaine : ${d.nom}` : null,
      reussis.length > 0 ? `Envoyé à : ${reussis.map((a) => a.agent).join(", ")}` : null,
      echecs.length > 0 ? `Non envoyé à : ${echecs.map((a) => a.agent).join(", ")}` : null,
    ].filter(Boolean);
    await notifierKamelTelegram(lignes.join("\n"));
  } catch (err) {
    console.error("Échec notification Telegram de l'envoi sécurité:", err);
  }
}

// Numéro d'un agent de sécurité (tous domaines) : ses réponses sont journalisées mais jamais
// confiées à l'agent IA client — c'est Kamel qui lit et répond depuis le suivi sécurité.
export async function isSecuritePhone(phone: string): Promise<boolean> {
  try {
    const ids = (await getDb().select({ id: domaines.id }).from(domaines)).map((d) => d.id);
    const agents = [...(await getAgentsSecurite(ids)).values()].flat();
    return agents.some((a) => phonesMatch(a.phone, phone));
  } catch {
    return false;
  }
}

export type EnvoiSecurite = {
  id: string;
  reservationId: string | null;
  destinataire: string;
  agentNom: string | null;
  mode: "auto" | "manuel";
  statut: "accepte" | "envoye" | "delivre" | "lu" | "echec";
  erreur: string | null;
  createdAt: Date;
  updatedAt: Date;
  contenu: string;
};

export type MessageConversation = {
  id: string;
  sens: "entrant" | "sortant";
  canal: "texte" | "template" | "vocal";
  contenu: string;
  statut: "accepte" | "envoye" | "delivre" | "lu" | "echec";
  erreur: string | null;
  audioUrl: string | null;
  createdAt: Date;
  estModeleSecurite: boolean;
};

// Fil complet avec un agent de sécurité (les deux sens, 60 derniers jours), du plus ancien au plus
// récent : le modèle envoyé, ses réponses, et les textes envoyés depuis l'app.
export async function getConversationAgent(phone: string): Promise<MessageConversation[]> {
  const lignes = await getDb()
    .select({
      id: whatsappOutboundMessages.id,
      sens: whatsappOutboundMessages.sens,
      canal: whatsappOutboundMessages.canal,
      contenu: whatsappOutboundMessages.contenu,
      statut: whatsappOutboundMessages.statut,
      erreur: whatsappOutboundMessages.erreur,
      audioUrl: whatsappOutboundMessages.audioUrl,
      createdAt: whatsappOutboundMessages.createdAt,
      ligne: whatsappOutboundMessages.ligne,
    })
    .from(whatsappOutboundMessages)
    .where(and(eq(whatsappOutboundMessages.destinataire, normaliserTelephone(phone)), gte(whatsappOutboundMessages.createdAt, addDays(new Date(), -60))))
    .orderBy(asc(whatsappOutboundMessages.createdAt))
    .limit(200);
  return lignes
    .filter((l) => !l.ligne)
    .map((l) => ({
      id: l.id,
      sens: l.sens,
      canal: l.canal,
      contenu: l.contenu,
      statut: l.statut,
      erreur: l.erreur,
      audioUrl: l.audioUrl,
      createdAt: l.createdAt,
      estModeleSecurite: l.contenu.startsWith(`[${MODELE_SECURITE}]`),
    }));
}

// Fenêtre de 24 h WhatsApp : du texte libre ne passe que si l'agent a écrit depuis moins de 24 h.
export function fenetreOuverte(messages: MessageConversation[]): boolean {
  const dernierEntrant = [...messages].reverse().find((m) => m.sens === "entrant");
  return Boolean(dernierEntrant && Date.now() - dernierEntrant.createdAt.getTime() < 24 * 60 * 60 * 1000);
}

// Journal des envois du modèle sécurité (30 derniers jours), rattachés à leur réservation grâce
// au lien contenu dans le message — fonctionne aussi pour les envois automatiques antérieurs.
export async function getEnvoisSecurite(agents: AgentSecurite[]): Promise<EnvoiSecurite[]> {
  const lignes = await getDb()
    .select({
      id: whatsappOutboundMessages.id,
      destinataire: whatsappOutboundMessages.destinataire,
      contenu: whatsappOutboundMessages.contenu,
      contexte: whatsappOutboundMessages.contexte,
      statut: whatsappOutboundMessages.statut,
      erreur: whatsappOutboundMessages.erreur,
      createdAt: whatsappOutboundMessages.createdAt,
      updatedAt: whatsappOutboundMessages.updatedAt,
    })
    .from(whatsappOutboundMessages)
    .where(
      and(
        eq(whatsappOutboundMessages.sens, "sortant"),
        like(whatsappOutboundMessages.contenu, `[${MODELE_SECURITE}]%`),
        gte(whatsappOutboundMessages.createdAt, addDays(new Date(), -30))
      )
    )
    .orderBy(desc(whatsappOutboundMessages.createdAt))
    .limit(300);
  return lignes.map((l) => ({
    id: l.id,
    reservationId: RE_RESA.exec(l.contenu)?.[1] ?? null,
    destinataire: l.destinataire,
    agentNom: agents.find((a) => phonesMatch(a.phone, l.destinataire))?.nom ?? null,
    mode: l.contexte === "securite_manuel" ? "manuel" : "auto",
    statut: l.statut,
    erreur: l.erreur,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    contenu: l.contenu,
  }));
}

// ---------------------------------------------------------------------------------------------
// Suivi sécurité (page /securite/envois) : par domaine, ses agents et ses dossiers d'arrivée —
// arrivées des 4 prochains jours (avec l'état des passeports) + séjours déjà signalés ces 30
// derniers jours, chacun avec ses envois par agent.

export type DossierSecurite = {
  reservationId: string;
  guestName: string;
  villaNom: string;
  villaNumero: string | null;
  arrivee: string; // « ven. 6 nov. à 15:00 »
  checkIn: Date;
  aVenir: boolean;
  passeports: string | null; // « 11/12 passeports », null si fiche terminée ou inconnue
  ficheComplete: boolean;
  envois: EnvoiSecurite[];
  ouverture: OuvertureSecurite | null; // première ouverture du lien par le gardien
};

export type DomaineSuiviSecurite = {
  id: string;
  nom: string;
  agents: AgentSecurite[];
  dossiers: DossierSecurite[];
};

export async function getSuiviSecurite(now: Date): Promise<DomaineSuiviSecurite[]> {
  const { getSecuriteOverview } = await import("@/lib/security-data");
  const { chargerArriveesDocuments, ficheToutRecue, progressionFiche } = await import("@/lib/arrivees-documents");
  const { format } = await import("date-fns");
  const { fr } = await import("date-fns/locale");

  const [domainesSec, arrivees] = await Promise.all([getSecuriteOverview(), chargerArriveesDocuments(now, 4)]);
  const agentsParDomaine = await getAgentsSecurite(domainesSec.map((d) => d.id));
  const envois = await getEnvoisSecurite([...agentsParDomaine.values()].flat());

  const domaineParVilla = new Map<string, string>();
  for (const d of domainesSec) for (const l of d.logements) domaineParVilla.set(l.villaId, d.id);
  const envoisParResa = new Map<string, EnvoiSecurite[]>();
  for (const e of envois) {
    if (!e.reservationId) continue;
    envoisParResa.set(e.reservationId, [...(envoisParResa.get(e.reservationId) ?? []), e]);
  }
  const libelle = (d: Date) => format(d, "EEE d MMM 'à' HH:mm", { locale: fr });

  const dossiersParDomaine = new Map<string, DossierSecurite[]>(domainesSec.map((d) => [d.id, []]));
  const vus = new Set<string>();
  const db = getDb();
  const numeros = new Map(
    (await db.select({ id: villas.id, numero: villas.numero }).from(villas)).map((v) => [v.id, v.numero] as const)
  );
  for (const a of arrivees) {
    const domaineId = a.villaId ? domaineParVilla.get(a.villaId) : undefined;
    if (!domaineId) continue;
    vus.add(a.id);
    dossiersParDomaine.get(domaineId)?.push({
      reservationId: a.id,
      guestName: a.guestName,
      villaNom: a.villaNom ?? "",
      villaNumero: a.villaId ? (numeros.get(a.villaId) ?? null) : null,
      arrivee: libelle(a.checkIn),
      checkIn: a.checkIn,
      aVenir: true,
      passeports: progressionFiche(a.fiche),
      ficheComplete: Boolean(a.fiche && ficheToutRecue(a.fiche)),
      envois: envoisParResa.get(a.id) ?? [],
      ouverture: null,
    });
  }
  const autres = [...envoisParResa.keys()].filter((id) => !vus.has(id));
  if (autres.length > 0) {
    const resas = await db
      .select({ id: reservations.id, guestName: reservations.guestName, checkIn: reservations.checkIn, villaId: reservations.villaId, villaNom: villas.nom, villaNumero: villas.numero })
      .from(reservations)
      .leftJoin(villas, eq(villas.id, reservations.villaId))
      .where(inArray(reservations.id, autres));
    resas.sort((x, y) => y.checkIn.getTime() - x.checkIn.getTime());
    for (const r of resas) {
      const domaineId = r.villaId ? domaineParVilla.get(r.villaId) : undefined;
      if (!domaineId) continue;
      dossiersParDomaine.get(domaineId)?.push({
        reservationId: r.id,
        guestName: r.guestName,
        villaNom: r.villaNom ?? "",
        villaNumero: r.villaNumero ?? null,
        arrivee: libelle(r.checkIn),
        checkIn: r.checkIn,
        aVenir: false,
        passeports: null,
        ficheComplete: false,
        envois: envoisParResa.get(r.id) ?? [],
        ouverture: null,
      });
    }
  }
  const tousDossiers = [...dossiersParDomaine.values()].flat();
  const ouvertures = await getOuvertures(tousDossiers.map((d) => d.reservationId));
  for (const d of tousDossiers) d.ouverture = ouvertures.get(d.reservationId) ?? null;
  return domainesSec.map((d) => ({ id: d.id, nom: d.nom, agents: agentsParDomaine.get(d.id) ?? [], dossiers: dossiersParDomaine.get(d.id) ?? [] }));
}
