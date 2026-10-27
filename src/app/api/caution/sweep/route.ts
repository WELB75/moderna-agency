import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { estMembreEquipe } from "@/lib/acces";
import { balayerCautions } from "@/lib/caution/service";
import { stripeConfigure } from "@/lib/caution/stripe";

export const maxDuration = 60;

// Cron quotidien (vercel.json) : renouvelle les empreintes des longs séjours avant leur
// expiration (7 jours) et lève celles des séjours terminés depuis 3 jours (règles dans
// lib/caution/regles.ts). Protégé par CRON_SECRET ; un compte de l'équipe connecté peut aussi la
// lancer à la main. Contrairement à d'autres crons de l'app, sans CRON_SECRET configuré la route
// reste fermée : elle touche à de l'argent.
async function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  const { userId } = await auth();
  return estMembreEquipe(userId);
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!stripeConfigure()) return NextResponse.json({ error: "Stripe non configuré (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET)." }, { status: 503 });
  const bilan = await balayerCautions();
  return NextResponse.json({ success: true, ...bilan });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
