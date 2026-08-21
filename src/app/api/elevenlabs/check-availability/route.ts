import { NextRequest, NextResponse } from "next/server";
import { checkAvailability } from "@/lib/whatsapp-agent/agent";
import { isAuthorizedElevenLabsTool } from "@/lib/elevenlabs-tools-auth";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthorizedElevenLabsTool(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const villa = body?.villa;
  const dateArrivee = body?.dateArrivee;
  const dateDepart = body?.dateDepart;
  if (!villa || !dateArrivee || !dateDepart) {
    return NextResponse.json({ error: "villa, dateArrivee et dateDepart sont obligatoires." }, { status: 400 });
  }

  const result = await checkAvailability(String(villa), String(dateArrivee), String(dateDepart));
  return NextResponse.json(result);
}
