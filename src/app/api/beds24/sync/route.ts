import { NextRequest, NextResponse } from "next/server";
import { runBeds24Sync } from "@/lib/beds24/sync";
import { analyserNuitsIsolees } from "@/lib/beds24/nuits-isolees";

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
  // Nuits isolées (1 nuit libre entre deux séjours avec "2 nuits min.") : séjour minimum abaissé
  // dans Beds24 pour qu'elles restent réservables — voir lib/beds24/nuits-isolees.ts. Indépendant
  // de la synchro des réservations : un échec ici ne change pas son code retour.
  const nuitsIsolees = await analyserNuitsIsolees({ appliquer: true });
  return NextResponse.json(
    { ...result, nuitsIsolees: { debloquees: nuitsIsolees.debloquees, restaurees: nuitsIsolees.restaurees, aDebloquer: nuitsIsolees.aDebloquer, erreur: nuitsIsolees.erreur } },
    { status: result.success ? 200 : 502 }
  );
}

export async function GET(req: NextRequest) {
  return POST(req);
}
