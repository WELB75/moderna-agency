import { NextRequest, NextResponse } from "next/server";
import { runIcalSync } from "@/lib/ical/sync";

export const maxDuration = 60;

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

  const result = await runIcalSync();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
