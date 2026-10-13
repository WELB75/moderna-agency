import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { beds24GetCalendar, Beds24ConfigError } from "@/lib/beds24/client";

// Détails jour par jour d'un logement Beds24 (prix nuitée, nuits min/max, arrivées et départs
// bloqués), chargés à la demande quand on déplie une villa dans la vue planning du calendrier.
// Réservé aux utilisateurs connectés ; ne renvoie jamais le token Beds24 ni l'erreur brute.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_JOURS = 400;

export async function GET(request: Request): Promise<NextResponse> {
  await auth.protect();

  const { searchParams } = new URL(request.url);
  const roomId = Number(searchParams.get("roomId"));
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!Number.isInteger(roomId) || roomId <= 0 || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  const jours = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (jours > MAX_JOURS) {
    return NextResponse.json({ error: "Période trop longue." }, { status: 400 });
  }

  try {
    const days = await beds24GetCalendar(roomId, from, to);
    return NextResponse.json({ days });
  } catch (error) {
    console.error("[beds24/calendrier]", error instanceof Beds24ConfigError ? error.message : error);
    return NextResponse.json({ error: "Calendrier Beds24 indisponible pour le moment." }, { status: 502 });
  }
}
