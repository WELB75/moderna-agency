import { NextRequest, NextResponse } from "next/server";
import { listVillasCatalog } from "@/lib/whatsapp-agent/agent";
import { isAuthorizedElevenLabsTool } from "@/lib/elevenlabs-tools-auth";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!isAuthorizedElevenLabsTool(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const villas = await listVillasCatalog();
  return NextResponse.json({ villas });
}
