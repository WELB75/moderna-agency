import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { whatsappConversations } from "@/db/schema";
import { runAgentTurn, repairMessageHistory } from "@/lib/whatsapp-agent/agent";
import { findPendingRequestForPhone, handleStaffReply } from "@/lib/whatsapp-agent/staff";

export const maxDuration = 60;

// Meta appelle ce GET une seule fois, au moment où on enregistre l'URL du webhook dans le
// dashboard de l'app — sert juste à prouver qu'on contrôle bien cette URL.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

async function sendWhatsAppText(to: string, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const res = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error("Échec envoi réponse WhatsApp:", res.status, await res.text());
  }
}

// Les messages vocaux WhatsApp arrivent comme un id de média, pas un fichier directement — il
// faut d'abord résoudre son URL de téléchargement temporaire auprès de Meta, puis télécharger le
// fichier lui-même (les deux appels nécessitent le même token d'accès).
async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return null;
  const metaRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    console.error("Échec résolution média WhatsApp:", metaRes.status, await metaRes.text());
    return null;
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };
  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) {
    console.error("Échec téléchargement média WhatsApp:", fileRes.status);
    return null;
  }
  return { buffer: await fileRes.arrayBuffer(), mimeType: meta.mime_type };
}

// Transcription via l'API Whisper de Groq (rapide, peu coûteuse, compatible format OpenAI).
async function transcribeAudio(buffer: ArrayBuffer, mimeType: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "bin";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error("Échec transcription Groq:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() || null;
}

// Historique de conversation persisté en base (chaque appel de webhook est une exécution
// serverless indépendante, rien ne survit en mémoire entre deux messages).
async function loadConversation(phone: string) {
  const db = getDb();
  const [row] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.phone, phone)).limit(1);
  return { db, existing: row };
}

// Upsert sur le numéro (index unique) plutôt qu'un choix insert/update basé sur l'état lu au
// début de la requête : une conversation à plusieurs tours appelle ceci plusieurs fois dans la
// même invocation, et un premier insert suivi d'un second insert (au lieu d'un update) casserait
// l'index unique sur "phone".
async function saveConversation(db: ReturnType<typeof getDb>, phone: string, messages: MessageParam[], lastMessageId: string) {
  await db
    .insert(whatsappConversations)
    .values({ phone, messages, lastMessageId })
    .onConflictDoUpdate({
      target: whatsappConversations.phone,
      set: { messages, updatedAt: new Date(), lastMessageId },
    });
}

export async function POST(req: NextRequest) {
  const payload = await req.json();

  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // Pas un message entrant (ex. accusé de statut "delivered"/"read") — rien à faire.
    if (!message) return NextResponse.json({ ok: true });

    // Texte et messages vocaux sont gérés ; les autres types (image, localisation...) reçoivent
    // une réponse de repli plutôt que d'être ignorés silencieusement côté client.
    const from = `+${message.from}`;
    let text = message.type === "text" ? message.text?.body?.trim() : null;

    if (!text && message.type === "audio" && message.audio?.id) {
      const media = await downloadWhatsAppMedia(message.audio.id);
      if (media) text = await transcribeAudio(media.buffer, media.mimeType);
      if (!text) {
        await sendWhatsAppText(message.from, "Désolé, je n'ai pas réussi à comprendre ce message vocal — pouvez-vous réessayer ou l'écrire par texte ?");
        return NextResponse.json({ ok: true });
      }
    }

    if (!text) {
      await sendWhatsAppText(message.from, "Je ne peux lire que du texte ou des messages vocaux pour l'instant — pouvez-vous décrire votre demande de cette façon ?");
      return NextResponse.json({ ok: true });
    }

    // Un numéro d'employée en attente de réponse à une proposition de mission est routé vers
    // l'agent de coordination personnel plutôt que l'agent client — deux conversations
    // totalement différentes sur le même numéro WhatsApp Meta (pas de second numéro pour
    // l'instant).
    const pendingStaffRequest = await findPendingRequestForPhone(from);
    if (pendingStaffRequest) {
      const staffReply = await handleStaffReply(pendingStaffRequest, text);
      await sendWhatsAppText(message.from, staffReply);
      return NextResponse.json({ ok: true });
    }

    const { db, existing } = await loadConversation(from);

    // Meta livre parfois deux fois le même événement (webhooks "at-least-once") — sans cette
    // vérification, deux traitements concurrents du même message peuvent corrompre l'historique
    // partagé (déjà arrivé le 02/08/2026 : conversation bloquée jusqu'à réparation manuelle).
    if (existing?.lastMessageId && existing.lastMessageId === message.id) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const messages: MessageParam[] = repairMessageHistory((existing?.messages as MessageParam[] | undefined) ?? []);

    // Un client peut reprendre contact des jours/semaines/mois après le dernier message —
    // l'historique complet est conservé (utile pour le contexte), mais sans annotation Claude n'a
    // aucun moyen de savoir combien de temps s'est écoulé et pourrait s'appuyer sur des infos
    // périmées (dispo, dates) comme si la conversation était ininterrompue.
    const RESUME_GAP_MS = 6 * 60 * 60 * 1000;
    const gapMs = existing?.updatedAt ? Date.now() - existing.updatedAt.getTime() : 0;
    const userContent =
      gapMs > RESUME_GAP_MS
        ? `[Reprise après une pause de ${Math.round(gapMs / (24 * 60 * 60 * 1000)) || "moins d'un"} jour(s) — dernier échange le ${existing!.updatedAt.toLocaleDateString("fr-FR")}]\n${text}`
        : text;
    messages.push({ role: "user", content: userContent });

    const reply = await runAgentTurn(messages, async (partial) => {
      await saveConversation(db, from, partial, message.id);
    });

    await saveConversation(db, from, messages, message.id);
    await sendWhatsAppText(message.from, reply);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erreur webhook WhatsApp:", err);
    // On répond quand même 200 : Meta réessaie sinon indéfiniment le même message.
    return NextResponse.json({ ok: false });
  }
}
