import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getTarification } from "@/lib/pricelabs/sync";

// Endpoint interne consommé par l'onglet Tarification (jamais par le navigateur directement vers
// PriceLabs) — voir src/lib/pricelabs/. Le corps de la réponse ne contient que ce que le front a
// besoin d'afficher, jamais PRICELABS_API_KEY ni les métadonnées de compte PriceLabs.
export async function GET(request: Request): Promise<NextResponse> {
  await auth.protect();

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";

  try {
    const villasTarifs = await getTarification({ force });
    return NextResponse.json({ villas: villasTarifs, generatedAt: new Date().toISOString() });
  } catch {
    // Jamais le détail brut de l'erreur (pourrait mentionner la clé ou l'infra PriceLabs) dans
    // la réponse HTTP — seulement dans les logs serveur, via getTarification/resyncVillas.
    return NextResponse.json({ error: "Prix temporairement indisponibles, réessayez plus tard." }, { status: 502 });
  }
}
