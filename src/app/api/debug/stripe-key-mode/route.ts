import { NextRequest, NextResponse } from "next/server";
import { getVillaStripePublicKey } from "@/lib/superhote/client";

// Diagnostic temporaire, à retirer juste après usage : indique si la clé Stripe publique
// connectée à un logement côté Superhote est en mode test ou live, SANS jamais renvoyer la
// clé elle-même. Kamel, 2026-08-29 : veut savoir s'il peut tester le paiement sans vrai débit.
export async function GET(req: NextRequest) {
  const propertyKey = req.nextUrl.searchParams.get("propertyKey");
  if (!propertyKey) return NextResponse.json({ error: "propertyKey manquant" }, { status: 400 });

  try {
    const publicKey = await getVillaStripePublicKey(propertyKey);
    const mode = publicKey.startsWith("pk_test_") ? "test" : publicKey.startsWith("pk_live_") ? "live" : "inconnu";
    return NextResponse.json({ propertyKey, mode });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erreur inconnue" }, { status: 500 });
  }
}
