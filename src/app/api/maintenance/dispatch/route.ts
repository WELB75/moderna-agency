import { NextRequest, NextResponse } from "next/server";
import { initiateMaintenanceRequest } from "@/lib/maintenance-ai";

// Route interne appelée par interventions.ts (Server Action) au lieu d'importer maintenance-ai.ts
// directement — celui-ci tire le SDK Anthropic + @vercel/blob, et un import de ce module dans un
// fichier "use server" (statique OU dynamique, testé les deux) casse le bundling Turbopack des
// Server Actions ("Received an instance of URL"), alors que le même module fonctionne très bien
// importé depuis une route API classique (voir whatsapp-webhook/route.ts, jamais cassé). Passer
// par un vrai appel HTTP interne contourne complètement le problème de bundling. Vu en prod le
// 2026-08-19 après deux tentatives précédentes (sharp, puis import dynamique) qui n'avaient pas
// la bonne cause.
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
  const { interventionId } = (await req.json()) as { interventionId?: string };
  if (!interventionId) {
    return NextResponse.json({ error: "interventionId manquant" }, { status: 400 });
  }
  await initiateMaintenanceRequest(interventionId);
  return NextResponse.json({ ok: true });
}
