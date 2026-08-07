import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { telegramConversations } from "@/db/schema";
import { runAgentTurn, repairMessageHistory } from "@/lib/telegram-agent/agent";

export const maxDuration = 60;

async function sendTelegramText(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) console.error("Échec envoi réponse Telegram:", res.status, await res.text());
}

// Les messages vocaux Telegram arrivent comme un file_id — il faut d'abord résoudre le chemin
// réel du fichier (getFile), puis le télécharger depuis un domaine séparé (api.telegram.org/file/...).
async function downloadTelegramVoice(fileId: string): Promise<ArrayBuffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!metaRes.ok) {
    console.error("Échec résolution fichier Telegram:", metaRes.status, await metaRes.text());
    return null;
  }
  const meta = (await metaRes.json()) as { result?: { file_path?: string } };
  const filePath = meta.result?.file_path;
  if (!filePath) return null;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) {
    console.error("Échec téléchargement fichier Telegram:", fileRes.status);
    return null;
  }
  return fileRes.arrayBuffer();
}

// Transcription via l'API Whisper de Groq — mêmes réglages que l'agent WhatsApp
// (src/app/api/whatsapp-webhook/route.ts), les notes vocales Telegram sont aussi en .ogg/opus.
async function transcribeAudio(buffer: ArrayBuffer): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", "whisper-large-v3-turbo");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error("Échec transcription Groq (Telegram):", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() || null;
}

async function loadConversation(chatId: string) {
  const db = getDb();
  const [row] = await db.select().from(telegramConversations).where(eq(telegramConversations.chatId, chatId)).limit(1);
  return { db, existing: row };
}

async function saveConversation(db: ReturnType<typeof getDb>, chatId: string, messages: MessageParam[], lastUpdateId: string) {
  await db
    .insert(telegramConversations)
    .values({ chatId, messages, lastUpdateId })
    .onConflictDoUpdate({
      target: telegramConversations.chatId,
      set: { messages, updatedAt: new Date(), lastUpdateId },
    });
}

export async function POST(req: NextRequest) {
  // Vérifie que l'appel vient bien de Telegram (secret fixé lors du setWebhook), pas d'un tiers
  // qui aurait deviné l'URL — cette route est forcément publique (webhook), voir proxy.ts.
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const payload = await req.json();

  try {
    const message = payload?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat?.id ?? "");
    const fromId = String(message.from?.id ?? "");
    if (!chatId || !fromId) return NextResponse.json({ ok: true });

    // Réservé à Kamel — tant que TELEGRAM_ALLOWED_USER_ID n'est pas encore fixé (bootstrap), on
    // laisse passer en journalisant l'id pour pouvoir le verrouiller juste après.
    const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
    if (allowedUserId && fromId !== allowedUserId) {
      console.warn("Message Telegram ignoré, expéditeur non autorisé:", fromId);
      return NextResponse.json({ ok: true });
    }
    if (!allowedUserId) {
      console.log("TELEGRAM_ALLOWED_USER_ID pas encore fixé — expéditeur de ce message:", fromId);
    }

    let text: string | null = message.text?.trim() || null;

    if (!text && message.voice?.file_id) {
      const buffer = await downloadTelegramVoice(message.voice.file_id);
      if (buffer) text = await transcribeAudio(buffer);
      if (!text) {
        await sendTelegramText(chatId, "Désolé, je n'ai pas réussi à comprendre ce message vocal — tu peux réessayer ou l'écrire ?");
        return NextResponse.json({ ok: true });
      }
    }

    if (!text) {
      await sendTelegramText(chatId, "Je ne peux lire que du texte ou des messages vocaux pour l'instant.");
      return NextResponse.json({ ok: true });
    }

    const { db, existing } = await loadConversation(chatId);
    const updateId = String(payload.update_id ?? "");
    if (existing?.lastUpdateId && existing.lastUpdateId === updateId) {
      return NextResponse.json({ ok: true, dedup: true });
    }

    const messages: MessageParam[] = repairMessageHistory((existing?.messages as MessageParam[] | undefined) ?? []);
    messages.push({ role: "user", content: text });

    const reply = await runAgentTurn(messages);
    await saveConversation(db, chatId, messages, updateId);
    await sendTelegramText(chatId, reply || "C'est noté.");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erreur webhook Telegram:", err);
    return NextResponse.json({ ok: true });
  }
}
