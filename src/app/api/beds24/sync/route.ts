import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { estMembreEquipe } from "@/lib/acces";
import { runBeds24Sync } from "@/lib/beds24/sync";
import { analyserNuitsIsolees } from "@/lib/beds24/nuits-isolees";

export const maxDuration = 60;

// Cron quotidien (vercel.json) : filet de sécurité si un appel du webhook Beds24 s'est perdu.
// Même protection que les autres crons (/api/ical/sync, /api/staff-requests/sweep...).
// Un utilisateur connecté à l'app peut aussi la lancer à la main (ouvrir /api/beds24/sync dans le
// navigateur) : utile pour forcer une resynchro sans connaître le secret du cron.
async function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  if (req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  // Compte de l'équipe seulement (pas n'importe quel compte Clerk), voir src/lib/acces.ts.
  const { userId } = await auth();
  return estMembreEquipe(userId);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
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
