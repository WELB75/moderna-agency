import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappOutboundMessages } from "@/db/schema";
import { textToSpeech } from "@/lib/whatsapp-agent/elevenlabs";

// Journalise chaque envoi sortant (voir whatsappOutboundMessages dans db/schema.ts) — un HTTP 200
// de Meta ne prouve pas la livraison, seul l'accusé reçu plus tard par webhook le fait ; on garde
// donc le wamid pour les rapprocher. Best-effort : une panne d'écriture en base ne doit jamais
// empêcher un message de partir.
async function journaliserEnvoi(entry: {
  destinataire: string;
  canal: "texte" | "template" | "vocal";
  contenu: string;
  contexte?: string;
  metaMessageId?: string | null;
  erreur?: string | null;
  audioUrl?: string | null;
}) {
  try {
    await getDb()
      .insert(whatsappOutboundMessages)
      .values({
        sens: "sortant",
        destinataire: entry.destinataire,
        canal: entry.canal,
        contenu: entry.contenu,
        contexte: entry.contexte ?? null,
        metaMessageId: entry.metaMessageId ?? null,
        statut: entry.erreur ? "echec" : "accepte",
        erreur: entry.erreur ?? null,
        audioUrl: entry.audioUrl ?? null,
      });
  } catch (err) {
    console.error("Échec journalisation envoi WhatsApp:", err);
  }
}

// Archive une note vocale sur Vercel Blob pour qu'elle reste réécoutable depuis l'app — ni Meta
// ni WhatsApp ne conservent les médias durablement. Best-effort : un échec d'archivage ne doit
// jamais empêcher l'envoi du message lui-même.
export async function archiverAudio(buffer: Buffer, prefixe: string): Promise<string | null> {
  try {
    const { put } = await import("@vercel/blob");
    const blob = await put(`whatsapp-vocaux/${prefixe}-${Date.now()}.mp3`, buffer, {
      access: "public",
      contentType: "audio/mpeg",
    });
    return blob.url;
  } catch (err) {
    console.error("Échec archivage audio:", err);
    return null;
  }
}

// Journalise un message REÇU (texte, ou transcription d'un vocal avec son audio archivé) — sans
// ça, seule la moitié sortante de chaque conversation était visible.
export async function journaliserReception(entry: {
  expediteur: string;
  canal: "texte" | "vocal";
  contenu: string;
  metaMessageId?: string | null;
  audioUrl?: string | null;
}) {
  try {
    await getDb()
      .insert(whatsappOutboundMessages)
      .values({
        sens: "entrant",
        destinataire: entry.expediteur,
        canal: entry.canal,
        contenu: entry.contenu,
        metaMessageId: entry.metaMessageId ?? null,
        // Un message reçu est par définition arrivé : pas d'accusé de livraison à attendre.
        statut: "delivre",
        audioUrl: entry.audioUrl ?? null,
      });
  } catch (err) {
    console.error("Échec journalisation réception WhatsApp:", err);
  }
}

// Extrait le wamid de la réponse Meta — clé de rapprochement avec les accusés de statut.
function extraireMessageId(body: unknown): string | null {
  const messages = (body as { messages?: { id?: string }[] } | null)?.messages;
  return messages?.[0]?.id ?? null;
}

// Point d'entrée unique pour l'envoi WhatsApp — auparavant dupliqué dans staff.ts et
// whatsapp-webhook/route.ts (deux copies identiques de sendWhatsAppText).
// Renvoie true/false selon que Meta a accepté le message (statut HTTP), pour que les appelants
// qui l'annoncent comme fait à Kamel (ex. relanceStaleMaintenanceConversations) puissent distinguer
// un vrai échec d'un envoi réussi — auparavant, un échec ne finissait que dans les logs serveur
// (jamais vus par Kamel) et le compte-rendu WhatsApp disait "envoyée" même si ça avait raté.
// Kamel, 2026-08-22 : "tu es sur que l'agent envoie bien des messages aux personnes concerné ?"
export async function sendWhatsAppText(to: string, body: string, contexte?: string): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return false;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
  });
  if (!res.ok) {
    const erreur = await res.text();
    console.error("Échec envoi texte WhatsApp:", res.status, erreur);
    await journaliserEnvoi({ destinataire: to, canal: "texte", contenu: body, contexte, erreur: `${res.status} ${erreur}` });
    return false;
  }
  await journaliserEnvoi({ destinataire: to, canal: "texte", contenu: body, contexte, metaMessageId: extraireMessageId(await res.json()) });
  return true;
}

// Premier message à un contact qui n'a jamais écrit à l'agence : WhatsApp interdit le texte libre
// dans ce cas (accepté par l'API avec un 200, mais jamais livré en pratique) — seul un modèle de
// message pré-approuvé par Meta peut ouvrir la conversation. Une fois que la personne répond,
// tous les messages suivants peuvent redevenir du texte libre (sendWhatsAppText), la fenêtre de
// conversation est ouverte. Kamel, 2026-08-22 : "meme les autres technicien... ils reçoivent pas".
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[],
  contexte?: string
): Promise<boolean> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return false;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace("+", ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
          : [],
      },
    }),
  });
  // Le journal garde le texte réellement reçu (paramètres substitués), pas le nom du modèle : le
  // corps fixe vit chez Meta, donc sans ça on ne pourrait pas relire ce qui est parti.
  const contenu = `[${templateName}] ${bodyParams.join(" | ")}`;
  if (!res.ok) {
    const erreur = await res.text();
    console.error("Échec envoi template WhatsApp:", res.status, erreur);
    await journaliserEnvoi({ destinataire: to, canal: "template", contenu, contexte, erreur: `${res.status} ${erreur}` });
    return false;
  }
  await journaliserEnvoi({ destinataire: to, canal: "template", contenu, contexte, metaMessageId: extraireMessageId(await res.json()) });
  return true;
}

// Upload d'un fichier vers la médiathèque WhatsApp (nécessaire avant de pouvoir l'envoyer comme
// message) — symétrique de downloadWhatsAppMedia côté entrant dans whatsapp-webhook/route.ts.
async function uploadWhatsAppMedia(buffer: Buffer, mimeType: string): Promise<string | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return null;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), "message.mp3");
  form.append("type", mimeType);

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    console.error("Échec upload média WhatsApp:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function sendWhatsAppAudio(to: string, mediaId: string, texteLu: string, contexte?: string, audioUrl?: string | null) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "audio", audio: { id: mediaId } }),
  });
  if (!res.ok) {
    const erreur = await res.text();
    console.error("Échec envoi audio WhatsApp:", res.status, erreur);
    await journaliserEnvoi({ destinataire: to, canal: "vocal", contenu: texteLu, contexte, erreur: `${res.status} ${erreur}`, audioUrl });
    return;
  }
  await journaliserEnvoi({ destinataire: to, canal: "vocal", contenu: texteLu, contexte, metaMessageId: extraireMessageId(await res.json()), audioUrl });
}

// Génère la voix (ElevenLabs, darija) et l'envoie comme note vocale. Échoue silencieusement à
// chaque étape (clé manquante, génération ratée, upload raté) sans jamais lever d'exception —
// la voix est un complément au texte, jamais un blocant pour l'envoi du message lui-même. Chaque
// échec est tout de même journalisé : sans ça, une voix qui ne part jamais reste invisible (c'est
// exactement ce qui s'est passé avec la note vocale à Brahim, Kamel 2026-09-20).
export async function sendWhatsAppVoice(to: string, text: string, contexte?: string) {
  const audio = await textToSpeech(text);
  if (!audio) {
    await journaliserEnvoi({ destinataire: to, canal: "vocal", contenu: text, contexte, erreur: "Génération ElevenLabs échouée (clé manquante ou appel en erreur)" });
    return;
  }
  const mediaId = await uploadWhatsAppMedia(audio, "audio/mpeg");
  if (!mediaId) {
    await journaliserEnvoi({ destinataire: to, canal: "vocal", contenu: text, contexte, erreur: "Upload du média WhatsApp échoué" });
    return;
  }
  const audioUrl = await archiverAudio(audio, "sortant");
  await sendWhatsAppAudio(to, mediaId, text, contexte, audioUrl);
}

// Texte + note vocale en parallèle — pour le personnel ménage/cuisine, dont certaines personnes
// ne savent pas lire (Kamel, 2026-08-08). Le texte part toujours ; la voix est best-effort (son
// échec n'affecte jamais le true/false renvoyé, qui reflète uniquement l'envoi du texte).
export async function sendWhatsAppTextAndVoice(to: string, body: string, contexte?: string): Promise<boolean> {
  const [textOk] = await Promise.all([sendWhatsAppText(to, body, contexte), sendWhatsAppVoice(to, body, contexte)]);
  return textOk;
}

// Rattrapage des notes vocales jamais livrées. WhatsApp refuse tout hors-modèle si le
// destinataire n'a pas écrit depuis 24h (code 131047), et Meta n'autorise pas l'audio dans un
// modèle approuvé : la voix ne peut donc PAS être garantie au moment de l'envoi. Or c'est le
// canal qui compte le plus ici — Kamel, 2026-09-20 : "la plupart des gens ne savent pas lire
// l'arabe, c'est donc très important d'ajouter cet audio".
// D'où ce rattrapage : le message entrant qui déclenche cet appel vient justement de rouvrir la
// fenêtre de 24h, c'est donc le seul instant où l'on est sûr que la voix passera. Appelé pour
// TOUT numéro entrant (personnel, technicien, Brahim), pas seulement Brahim.
export async function renvoyerVocalEnAttente(phone: string): Promise<void> {
  const db = getDb();
  // 48h : au-delà, un rappel de courses ou une offre de mission n'a plus d'intérêt — mieux vaut
  // ne rien envoyer qu'une consigne périmée.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [enAttente] = await db
    .select({ id: whatsappOutboundMessages.id, contenu: whatsappOutboundMessages.contenu, contexte: whatsappOutboundMessages.contexte })
    .from(whatsappOutboundMessages)
    .where(
      and(
        eq(whatsappOutboundMessages.destinataire, phone),
        eq(whatsappOutboundMessages.canal, "vocal"),
        eq(whatsappOutboundMessages.statut, "echec"),
        isNull(whatsappOutboundMessages.renvoyeAt),
        gte(whatsappOutboundMessages.createdAt, cutoff)
      )
    )
    .orderBy(desc(whatsappOutboundMessages.createdAt))
    .limit(1);
  if (!enAttente) return;

  // Marqué AVANT l'envoi : si le renvoi échoue encore, on ne veut pas réessayer en boucle à
  // chaque message entrant suivant.
  await db
    .update(whatsappOutboundMessages)
    .set({ renvoyeAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappOutboundMessages.id, enAttente.id));

  await sendWhatsAppVoice(phone, enAttente.contenu, enAttente.contexte ?? undefined);
}
