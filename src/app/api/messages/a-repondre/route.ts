import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { chargerBoiteReception } from "@/app/(app)/chat/messages-boite-reception";

// Nombre de conversations en attente de réponse, pour la pastille "Messages" du menu
// (Kamel, 2026-10-15 : "une pastille quand on reçoit des nouveaux messages"). Mêmes
// conversations que la boîte de réception ; résultat gardé 2 minutes en mémoire pour ne pas
// multiplier les appels Beds24 (quota) quand plusieurs onglets ou utilisateurs interrogent.
const CACHE_MS = 2 * 60 * 1000;
// WhatsApp : l'IA est coupée et le webhook ignore les messages, une vieille conversation restée
// "en attente" ne doit pas allumer la pastille indéfiniment.
const WHATSAPP_JOURS = 3;

let cache: { at: number; count: number } | null = null;

export async function GET(): Promise<NextResponse> {
  await auth.protect();
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ count: cache.count });
  }
  try {
    const { items } = await chargerBoiteReception();
    const limite = Date.now() - WHATSAPP_JOURS * 86_400_000;
    const count = items.filter((c) => {
      if (!c.awaitingReply) return false;
      if (c.channel === "whatsapp") return new Date(c.lastAt).getTime() >= limite;
      return true;
    }).length;
    cache = { at: Date.now(), count };
    return NextResponse.json({ count });
  } catch (error) {
    console.error("[messages/a-repondre]", error);
    return NextResponse.json({ count: cache?.count ?? 0 });
  }
}
