import { NextRequest, NextResponse } from "next/server";
import { cascadeStaleRequests } from "@/lib/whatsapp-agent/staff";

export const maxDuration = 60;

// Filet de sécurité : le webhook WhatsApp déclenche déjà cascadeStaleRequests() à chaque message
// entrant (trafic fréquent en pratique), mais une période sans aucun message (nuit, weekend
// calme) laisserait une demande périmée bloquée jusqu'au prochain message. Ce cron quotidien
// couvre ces périodes creuses.
function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  await cascadeStaleRequests();
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
