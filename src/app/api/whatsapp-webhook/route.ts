import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getDb } from "@/db";
import { whatsappConversations } from "@/db/schema";
import { runAgentTurn } from "@/lib/whatsapp-agent/agent";

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

// Historique de conversation persisté en base (chaque appel de webhook est une exécution
// serverless indépendante, rien ne survit en mémoire entre deux messages).
async function loadConversation(phone: string) {
  const db = getDb();
  const [row] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.phone, phone)).limit(1);
  return { db, existing: row };
}

async function saveConversation(db: ReturnType<typeof getDb>, phone: string, existingId: string | undefined, messages: MessageParam[]) {
  if (existingId) {
    await db.update(whatsappConversations).set({ messages, updatedAt: new Date() }).where(eq(whatsappConversations.id, existingId));
  } else {
    await db.insert(whatsappConversations).values({ phone, messages });
  }
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

    // Seul le texte est géré pour l'instant ; les autres types (image, audio, localisation...)
    // reçoivent une réponse de repli plutôt que d'être ignorés silencieusement côté client.
    const from = `+${message.from}`;
    const text = message.type === "text" ? message.text?.body?.trim() : null;

    if (!text) {
      await sendWhatsAppText(message.from, "Je ne peux lire que du texte pour l'instant — pouvez-vous décrire votre demande par écrit ?");
      return NextResponse.json({ ok: true });
    }

    const { db, existing } = await loadConversation(from);
    const messages: MessageParam[] = (existing?.messages as MessageParam[] | undefined) ?? [];
    messages.push({ role: "user", content: text });

    const reply = await runAgentTurn(messages);

    await saveConversation(db, from, existing?.id, messages);
    await sendWhatsAppText(message.from, reply);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erreur webhook WhatsApp:", err);
    // On répond quand même 200 : Meta réessaie sinon indéfiniment le même message.
    return NextResponse.json({ ok: false });
  }
}
