import { NextResponse } from "next/server";
import { traduireMessagesRecus } from "@/lib/actions/traduction";

// Traduction des messages reçus : route API (fetch) et non Server Action. Les Server Actions
// passent par la même file que la navigation : une traduction de 2-3 s bloquait les clics suivants
// (menu, retour...) tant qu'elle n'était pas finie. Un fetch, lui, ne bloque rien.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { textes?: unknown };
    const textes = Array.isArray(body.textes) ? body.textes.map((t) => String(t)) : [];
    return NextResponse.json({ traductions: await traduireMessagesRecus(textes) });
  } catch (error) {
    console.error("[messages/traduire]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Traduction indisponible." }, { status: 500 });
  }
}
