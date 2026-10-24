import { NextRequest, NextResponse } from "next/server";
import { construireRappel, envoyerRappelTelegram, type MomentRappel } from "@/lib/telegram-rappels";

export const maxDuration = 60;

// Crons quotidiens : ?moment=matin (check-ins/outs du jour) et ?moment=soir (ceux du lendemain),
// voir telegram-rappels.ts. `dry=1` renvoie le texte sans l'envoyer, pour tester.
function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const moment = req.nextUrl.searchParams.get("moment");
  if (moment !== "matin" && moment !== "soir") {
    return NextResponse.json({ error: "moment doit valoir matin ou soir" }, { status: 400 });
  }
  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ text: await construireRappel(moment as MomentRappel) });
  }
  return NextResponse.json(await envoyerRappelTelegram(moment as MomentRappel));
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
