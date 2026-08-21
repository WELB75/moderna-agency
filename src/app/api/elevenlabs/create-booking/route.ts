import { NextRequest, NextResponse } from "next/server";
import { createBooking } from "@/lib/whatsapp-agent/agent";
import { isAuthorizedElevenLabsTool } from "@/lib/elevenlabs-tools-auth";

export const maxDuration = 60;

const REQUIRED_FIELDS = ["villa", "dateArrivee", "dateDepart", "prenom", "nom", "email", "telephone", "pays", "nombreAdultes"];

export async function POST(req: NextRequest) {
  if (!isAuthorizedElevenLabsTool(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }
  const missing = REQUIRED_FIELDS.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length > 0) {
    return NextResponse.json({ error: `Champ(s) manquant(s) : ${missing.join(", ")}` }, { status: 400 });
  }

  const result = await createBooking(body as Record<string, unknown>);
  return NextResponse.json(result);
}
