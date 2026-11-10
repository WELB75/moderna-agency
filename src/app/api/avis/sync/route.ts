import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { estMembreEquipe } from "@/lib/acces";
import { synchroniserAvis } from "@/lib/avis/sync";

export const maxDuration = 300;

// Cron quotidien (vercel.json) + lancement manuel par un membre de l'équipe connecté (ouvrir
// /api/avis/sync dans le navigateur). Même protection que /api/beds24/sync.
async function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  if (req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  const { userId } = await auth();
  return estMembreEquipe(userId);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const result = await synchroniserAvis();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
