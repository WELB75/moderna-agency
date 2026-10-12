import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runBeds24Sync } from "@/lib/beds24/sync";

export const maxDuration = 60;

// Webhook Beds24 (Paramètres > Propriétés > Accès > "Booking Webhook") : appelé par Beds24 à
// chaque création/modification/annulation de réservation, pour que l'app soit à jour tout de
// suite au lieu d'attendre le cron quotidien. Le contenu envoyé par Beds24 n'est volontairement
// pas utilisé : on relance simplement la synchro complète (même code que le bouton et le cron),
// ce qui évite de faire confiance à des données reçues de l'extérieur.
//
// Protection : secret partagé passé en paramètre ?key= (Beds24 ne permet pas d'ajouter un en-tête
// d'autorisation), comparé à BEDS24_WEBHOOK_SECRET en temps constant.

function keyMatches(provided: string, expected: string): boolean {
  // Hachage préalable : timingSafeEqual exige deux buffers de même longueur, et on ne veut pas
  // révéler la longueur du secret attendu par un retour anticipé.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const secret = process.env.BEDS24_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "BEDS24_WEBHOOK_SECRET manquant dans l'environnement." }, { status: 500 });
  }

  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!key || !keyMatches(key, secret)) {
    return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
  }

  const result = await runBeds24Sync();
  if (!result.success) {
    console.error("Webhook Beds24 : échec de la synchro :", result.error);
    // Erreur de configuration (token Beds24 absent/invalide) : 500 pour que l'échec soit visible
    // dans les journaux Vercel et que Beds24 puisse retenter.
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result, { status: 200 });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
