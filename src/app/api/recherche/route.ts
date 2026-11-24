import { NextResponse } from "next/server";
import { searchGlobal } from "@/lib/actions/search";

// Recherche globale (barre du haut, Cmd+K) : route API (fetch) et non Server Action, pour que la
// saisie n'occupe pas la file partagée avec la navigation.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ resultats: await searchGlobal(q) });
  } catch (error) {
    console.error("[recherche]", error instanceof Error ? error.message : error);
    return NextResponse.json({ resultats: [] }, { status: 500 });
  }
}
