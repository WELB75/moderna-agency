import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramConversations } from "@/db/schema";
import { idsAutorises } from "@/lib/telegram-agent/utilisateurs";

// Envoi de messages sur Telegram (Kamel et l'équipe autorisée), partagé par les rappels matin/soir (telegram-rappels.ts)
// et les notifications d'événements (nouvelle réservation, annulation, nouveau souci de villa).

// Limite Telegram : 4096 caractères par message.
const LIMITE_TEXTE = 3800;

// Destinataires des rappels et notifications : toutes les personnes autorisées sur l'assistant
// (Kamel et Fouad, voir TELEGRAM_ALLOWED_USER_ID). Conversation privée : l'id du chat est celui de
// l'utilisateur. Sans liste, on prend la dernière conversation connue du bot.
export async function chatIdsDestinataires(): Promise<string[]> {
  const ids = idsAutorises();
  if (ids.length > 0) return ids;
  const [row] = await getDb()
    .select({ chatId: telegramConversations.chatId })
    .from(telegramConversations)
    .orderBy(desc(telegramConversations.updatedAt))
    .limit(1);
  return row ? [row.chatId] : [];
}

export async function envoyerTelegram(texte: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: false, reason: "TELEGRAM_BOT_TOKEN manquant" };
  const chatIds = await chatIdsDestinataires();
  if (chatIds.length === 0) return { sent: false, reason: "chat Telegram inconnu (écrire une fois au bot)" };

  const text = texte.length > LIMITE_TEXTE ? `${texte.slice(0, LIMITE_TEXTE)}\n[message tronqué]` : texte;
  // Un destinataire en échec ne doit pas empêcher l'envoi aux autres.
  const resultats = await Promise.all(
    chatIds.map(async (chatId) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!res.ok) console.error("Échec envoi Telegram:", chatId, res.status, await res.text());
      return res;
    }),
  );
  const ok = resultats.some((r) => r.ok);
  return ok ? { sent: true } : { sent: false, reason: `Telegram ${resultats[0].status}` };
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
