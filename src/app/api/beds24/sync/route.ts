import { NextRequest, NextResponse } from "next/server";
import { runBeds24Sync } from "@/lib/beds24/sync";

export const maxDuration = 60;

// Cron quotidien (vercel.json) : filet de sécurité si un appel du webhook Beds24 s'est perdu.
// Même protection que les autres crons (/api/ical/sync, /api/staff-requests/sweep...).
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

  const result = await runBeds24Sync();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
