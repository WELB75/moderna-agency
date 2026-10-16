import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { inboxReads } from "@/db/schema-recaps";
import { chargerBoiteReception } from "@/app/(app)/chat/messages-boite-reception";

// Nombre de conversations NON LUES, pour la pastille "Messages" du menu (Kamel, 2026-10-15 : "une
// pastille quand on reçoit des nouveaux messages", puis 2026-10-16 : "quand je lis le message ça
// doit descendre"). Non lue = le voyageur a écrit en dernier et la conversation n'a pas été
// ouverte depuis (table inbox_reads). Le chargement Beds24 est gardé 2 minutes en mémoire (quota),
// mais la lecture "lu / non lu" est relue en base à chaque appel : ouvrir une conversation fait
// descendre le compteur tout de suite.
const CACHE_MS = 2 * 60 * 1000;
// WhatsApp : l'IA est coupée et le webhook ignore les messages, une vieille conversation restée
// "en attente" ne doit pas allumer la pastille indéfiniment.
const WHATSAPP_JOURS = 3;

type Attente = { key: string; lastAt: number; channel: string };
let cache: { at: number; attente: Attente[] } | null = null;

export async function GET(request: Request): Promise<NextResponse> {
  await auth.protect();
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    if (!cache || force || Date.now() - cache.at >= CACHE_MS) {
      const { items } = await chargerBoiteReception();
      const limite = Date.now() - WHATSAPP_JOURS * 86_400_000;
      cache = {
        at: Date.now(),
        attente: items
          .filter((c) => c.unread)
          .filter((c) => c.channel !== "whatsapp" || new Date(c.lastAt).getTime() >= limite)
          .map((c) => ({ key: c.key, lastAt: new Date(c.lastAt).getTime(), channel: c.channel })),
      };
    }
    // Relit les lectures à chaque appel : une conversation ouverte après le chargement en cache
    // ne doit plus compter.
    const lectures = new Map((await getDb().select().from(inboxReads)).map((r) => [r.convKey, r.readAt.getTime()]));
    const count = cache.attente.filter((c) => c.lastAt > (lectures.get(c.key) ?? 0)).length;
    return NextResponse.json({ count });
  } catch (error) {
    console.error("[messages/a-repondre]", error);
    return NextResponse.json({ count: 0 });
  }
}
