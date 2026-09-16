import { NextRequest, NextResponse } from "next/server";
import { notifyBrahimCourses } from "@/lib/whatsapp-agent/brahim";

export const maxDuration = 60;

// Cron quotidien : prévient Brahim des courses à faire pour les ménages de départ du lendemain
// (voir notifyBrahimCourses dans brahim.ts). `date` en query param permet de forcer une date
// précise pour tester sans attendre le vrai lendemain (ex. ?date=2026-09-17).
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
  const date = req.nextUrl.searchParams.get("date") ?? undefined;
  const result = await notifyBrahimCourses(date);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
