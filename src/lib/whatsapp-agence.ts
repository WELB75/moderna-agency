import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappOutboundMessages } from "@/db/schema";

// Ligne WhatsApp Business de l'agence (+212 6 68 73 09 09), branchée en "coexistence" : le
// téléphone garde l'application WhatsApp Business ET l'API reçoit une copie de tout. Kamel,
// 2026-10-21 : "l'objectif, ce n'est pas de brancher un agent IA, c'est juste d'avoir les
// conversations et tout le flux WhatsApp dans notre application". Donc ici : on stocke et on
// affiche, on n'appelle JAMAIS d'agent et on ne répond jamais automatiquement.
export const LIGNE_AGENCE = "agence";
const GRAPH = "https://graph.facebook.com/v25.0";

export function agencePhoneNumberId(): string | null {
  return process.env.WHATSAPP_AGENCE_PHONE_NUMBER_ID?.trim() || null;
}

type Contenu = { canal: "texte" | "vocal"; texte: string };

// Les médias ne sont pas téléchargés : un libellé lisible suffit pour suivre la conversation, et
// le détail reste consultable sur le téléphone.
function contenuMessage(m: Record<string, unknown>): Contenu {
  const type = String(m.type ?? "");
  const text = (m.text as { body?: string } | undefined)?.body;
  if (type === "text" && text) return { canal: "texte", texte: text };
  if (type === "audio") return { canal: "vocal", texte: "[Message vocal]" };
  const legende = (m[type] as { caption?: string } | undefined)?.caption;
  const libelles: Record<string, string> = {
    image: "Photo",
    video: "Vidéo",
    document: "Document",
    sticker: "Sticker",
    location: "Localisation",
    contacts: "Contact partagé",
    reaction: "Réaction",
    button: "Réponse bouton",
    interactive: "Réponse interactive",
  };
  const base = libelles[type] ?? "Message non pris en charge";
  return { canal: "texte", texte: legende ? `[${base}] ${legende}` : `[${base}]` };
}

function horodatage(ts: unknown): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

async function journaliser(entry: {
  sens: "entrant" | "sortant";
  contact: string;
  contenu: Contenu;
  metaMessageId: string | null;
  at: Date;
  statut?: "accepte" | "delivre";
  erreur?: string | null;
}): Promise<void> {
  const db = getDb();
  if (entry.metaMessageId) {
    // Meta relivre ses webhooks, et l'historique importé peut recouper des messages déjà reçus.
    const [deja] = await db
      .select({ id: whatsappOutboundMessages.id })
      .from(whatsappOutboundMessages)
      .where(eq(whatsappOutboundMessages.metaMessageId, entry.metaMessageId))
      .limit(1);
    if (deja) return;
  }
  await db.insert(whatsappOutboundMessages).values({
    sens: entry.sens,
    destinataire: entry.contact,
    canal: entry.contenu.canal,
    contenu: entry.contenu.texte,
    metaMessageId: entry.metaMessageId,
    statut: entry.statut ?? (entry.sens === "entrant" ? "delivre" : "accepte"),
    erreur: entry.erreur ?? null,
    ligne: LIGNE_AGENCE,
    createdAt: entry.at,
    updatedAt: entry.at,
  });
}

const plus = (n: unknown) => `+${String(n ?? "").replace(/\D/g, "")}`;

// Un changement du webhook concerne-t-il la ligne agence ? Les événements propres à la
// coexistence (copies des messages envoyés depuis le téléphone, import d'historique) arrivent
// sous des champs dédiés ; les messages reçus portent le phone_number_id de la ligne.
export function estChangementAgence(change: { field?: string; value?: { metadata?: { phone_number_id?: string } } } | undefined): boolean {
  if (!change) return false;
  if (change.field === "smb_message_echoes" || change.field === "history" || change.field === "smb_app_state_sync") return true;
  const id = agencePhoneNumberId();
  return Boolean(id && change.value?.metadata?.phone_number_id === id);
}

export async function traiterChangementAgence(change: { field?: string; value?: Record<string, unknown> }): Promise<void> {
  const value = change.value ?? {};

  // Messages envoyés depuis l'application WhatsApp Business du téléphone (copie "echo").
  const echos = value.message_echoes;
  if (Array.isArray(echos)) {
    for (const m of echos as Record<string, unknown>[]) {
      await journaliser({
        sens: "sortant",
        contact: plus(m.to),
        contenu: contenuMessage(m),
        metaMessageId: (m.id as string | undefined) ?? null,
        at: horodatage(m.timestamp),
        statut: "delivre",
      });
    }
  }

  // Historique importé à la connexion (jusqu'à 6 mois) : fils de discussion par contact.
  const history = value.history;
  if (Array.isArray(history)) {
    for (const bloc of history as { threads?: { id?: string; messages?: Record<string, unknown>[] }[] }[]) {
      for (const fil of bloc.threads ?? []) {
        for (const m of fil.messages ?? []) {
          const fromMe = (m.history_context as { from_me?: boolean } | undefined)?.from_me === true;
          const contact = plus(fil.id ?? (fromMe ? m.to : m.from));
          await journaliser({
            sens: fromMe ? "sortant" : "entrant",
            contact,
            contenu: contenuMessage(m),
            metaMessageId: (m.id as string | undefined) ?? null,
            at: horodatage(m.timestamp),
            statut: "delivre",
          });
        }
      }
    }
  }

  // Accusés de livraison / lecture des messages envoyés depuis l'app (jamais d'alerte à Kamel).
  const statuts = value.statuses;
  if (Array.isArray(statuts)) {
    const interne = { sent: "envoye", delivered: "delivre", read: "lu", failed: "echec" } as const;
    for (const s of statuts as { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[]) {
      const statut = interne[s.status as keyof typeof interne];
      if (!s.id || !statut) continue;
      await getDb()
        .update(whatsappOutboundMessages)
        .set({ statut, erreur: s.errors?.[0] ? (s.errors[0].title ?? s.errors[0].message ?? null) : undefined, updatedAt: new Date() })
        .where(eq(whatsappOutboundMessages.metaMessageId, s.id));
    }
  }

  // Messages reçus des clients sur la ligne.
  const messages = value.messages;
  if (Array.isArray(messages)) {
    for (const m of messages as Record<string, unknown>[]) {
      await journaliser({
        sens: "entrant",
        contact: plus(m.from),
        contenu: contenuMessage(m),
        metaMessageId: (m.id as string | undefined) ?? null,
        at: horodatage(m.timestamp),
      });
    }
  }
}

export type MessageAgence = { sens: "entrant" | "sortant"; contenu: string; at: Date; statut: string };

export async function chargerMessagesAgence(): Promise<Map<string, MessageAgence[]>> {
  const rows = await getDb()
    .select({
      contact: whatsappOutboundMessages.destinataire,
      sens: whatsappOutboundMessages.sens,
      contenu: whatsappOutboundMessages.contenu,
      at: whatsappOutboundMessages.createdAt,
      statut: whatsappOutboundMessages.statut,
    })
    .from(whatsappOutboundMessages)
    .where(eq(whatsappOutboundMessages.ligne, LIGNE_AGENCE))
    .orderBy(asc(whatsappOutboundMessages.createdAt))
    .limit(5000);
  const parContact = new Map<string, MessageAgence[]>();
  for (const r of rows) {
    const liste = parContact.get(r.contact) ?? [];
    liste.push({ sens: r.sens, contenu: r.contenu, at: r.at, statut: r.statut });
    parContact.set(r.contact, liste);
  }
  return parContact;
}

// WhatsApp n'accepte le texte libre que dans les 24 h qui suivent le dernier message du client.
export const FENETRE_24H_MS = 24 * 60 * 60 * 1000;

export async function envoyerDepuisAgence(contact: string, texte: string): Promise<void> {
  const phoneNumberId = agencePhoneNumberId();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) throw new Error("La ligne WhatsApp de l'agence n'est pas encore connectée.");

  const db = getDb();
  const [dernierEntrant] = await db
    .select({ at: whatsappOutboundMessages.createdAt })
    .from(whatsappOutboundMessages)
    .where(
      and(
        eq(whatsappOutboundMessages.ligne, LIGNE_AGENCE),
        eq(whatsappOutboundMessages.destinataire, contact),
        eq(whatsappOutboundMessages.sens, "entrant")
      )
    )
    .orderBy(desc(whatsappOutboundMessages.createdAt))
    .limit(1);
  if (!dernierEntrant) throw new Error("Aucune conversation avec ce numéro sur la ligne de l'agence.");
  if (Date.now() - dernierEntrant.at.getTime() > FENETRE_24H_MS) {
    throw new Error("Le client n'a pas écrit depuis plus de 24 h : WhatsApp bloque le texte libre depuis l'app. Répondez depuis le téléphone.");
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: contact.replace("+", ""), type: "text", text: { body: texte } }),
  });
  if (!res.ok) {
    console.error("Échec envoi WhatsApp ligne agence:", res.status, await res.text());
    throw new Error("WhatsApp a refusé l'envoi. Réessayez, ou répondez depuis le téléphone.");
  }
  const body = (await res.json()) as { messages?: { id?: string }[] };
  await journaliser({
    sens: "sortant",
    contact,
    contenu: { canal: "texte", texte },
    metaMessageId: body.messages?.[0]?.id ?? null,
    at: new Date(),
  });
}
