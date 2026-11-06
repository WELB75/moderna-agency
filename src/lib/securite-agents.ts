import { and, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import { addDays } from "date-fns";
import { getDb } from "@/db";
import { domaines, reservations, villas, whatsappOutboundMessages } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { phonesMatch } from "@/lib/phone";
import { sendWhatsAppTemplate } from "@/lib/whatsapp-agent/send";

// Agents de sécurité par domaine (Kamel, 2026-11-06 : « il me faut un espace pour visualiser que
// l'envoi a bien été fait aux différents agents de sécurité »). Un domaine peut avoir plusieurs
// gardiens (équipes jour / nuit...) : chacun reçoit le modèle Meta « securite_arrivee_invite ».
// L'ancien numéro unique `domaines.securite_phone` reste pris en compte comme premier agent.
export const MODELE_SECURITE = "securite_arrivee_invite";

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
  return { resultats };
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
};

const RE_RESA = /\/securite\/villa\/([0-9a-f-]{36})/i;

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
  }));
}
