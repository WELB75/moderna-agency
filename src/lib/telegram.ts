import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramConversations } from "@/db/schema";

// Envoi de messages à Kamel sur Telegram, partagé par les rappels matin/soir (telegram-rappels.ts)
// et les notifications d'événements (nouvelle réservation, annulation, nouveau souci de villa).

// Limite Telegram : 4096 caractères par message.
const LIMITE_TEXTE = 3800;

export async function chatIdDeKamel(): Promise<string | null> {
  // Conversation privée : l'id du chat est celui de l'utilisateur, donc TELEGRAM_ALLOWED_USER_ID
  // convient tel quel. Sans lui, on prend la dernière conversation connue du bot (Kamel seul).
  const allowed = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (allowed) return allowed;
  const [row] = await getDb()
    .select({ chatId: telegramConversations.chatId })
    .from(telegramConversations)
    .orderBy(desc(telegramConversations.updatedAt))
    .limit(1);
  return row?.chatId ?? null;
}

export async function envoyerTelegram(texte: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: false, reason: "TELEGRAM_BOT_TOKEN manquant" };
  const chatId = await chatIdDeKamel();
  if (!chatId) return { sent: false, reason: "chat Telegram inconnu (écrire une fois au bot)" };

  const text = texte.length > LIMITE_TEXTE ? `${texte.slice(0, LIMITE_TEXTE)}\n[message tronqué]` : texte;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error("Échec envoi Telegram:", res.status, await res.text());
    return { sent: false, reason: `Telegram ${res.status}` };
  }
  return { sent: true };
}

// Best-effort : une notification ne doit jamais faire échouer l'action qui l'a déclenchée
// (synchro, création de réservation...), ni lever d'erreur si la base ou Telegram est
// indisponible.
export async function notifierKamelTelegram(texte: string): Promise<void> {
  try {
    await envoyerTelegram(texte);
  } catch (err) {
    console.error("Échec notification Telegram:", err);
  }
}
