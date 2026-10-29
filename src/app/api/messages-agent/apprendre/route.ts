import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { estMembreEquipe } from "@/lib/acces";
import { apprendreLot, chercherCodes, consoliderTheme, themesAConsolider } from "@/lib/messages-agent/memoire";

export const maxDuration = 300;

// Crons (vercel.json, 4 passages par jour) : l'agent IA apprend des nouveaux messages Airbnb / Booking.com
// (fils des séjours récents où il y a du nouveau), puis consolide les thèmes concernés. Même
// protection que les autres crons ; un compte de l'équipe peut aussi la lancer à la main.
async function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  if (req.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  const { userId } = await auth();
  return estMembreEquipe(userId);
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  // ?mode=tout : lit tout l'historique pas encore lu (lot après lot, dans la limite du temps
  // disponible ; relancer tant que `restants` > 0). Par défaut : seulement les fils récents.
  const mode = req.nextUrl.searchParams.get("mode") === "tout" ? "tout" : "recents";
  const debut = Date.now();
  try {
    const bilan = await apprendreLot(mode);
    while (mode === "tout" && bilan.restants > 0 && Date.now() - debut < 150_000) {
      const suite = await apprendreLot(mode);
      bilan.analyses += suite.analyses;
      bilan.vides += suite.vides;
      bilan.erreurs += suite.erreurs;
      bilan.echanges += suite.echanges;
      bilan.restants = suite.restants;
      if (suite.analyses + suite.vides + suite.erreurs === 0) break;
    }
    let themes = (await themesAConsolider()).slice(0, 6);
    if (mode === "tout" && bilan.restants > 0) themes = []; // on consolide une fois tout lu
    let fiches = 0;
    for (const t of themes) fiches += await consoliderTheme(t);
    // ?codes=1 (passage de nuit) : cherche aussi wifi / boîtier / porte dans les messages et les
    // propose sur la page Mémoire de l'agent. Jamais appliqués tout seuls.
    let codes: { propositions: number; erreurs: string[] } | null = null;
    if (req.nextUrl.searchParams.get("codes") === "1") {
      try {
        const c = await chercherCodes();
        codes = { propositions: c.propositions, erreurs: c.erreurs };
      } catch (err) {
        console.error("Mémoire agent (cron) : codes:", err);
        codes = { propositions: 0, erreurs: [err instanceof Error ? err.message : "Erreur"] };
      }
    }
    return NextResponse.json({ ...bilan, themesConsolides: themes.length, fiches, codes });
  } catch (err) {
    console.error("Mémoire agent (cron):", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export const POST = GET;
