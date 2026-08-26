import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, ne, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";

// Export iCal des réservations Moderna Agency pour que Superhote (legacy), Airbnb ou Booking.com
// puissent l'importer comme calendrier de blocage — évite les doubles réservations sans passer par
// aucun channel manager (Kamel, 2026-08-26 : "je veux sortir de super hote définitivement").
//
// Paramètre ?for=airbnb|booking : exclut la source qui reçoit l'export, pour ne jamais réexporter
// une plateforme vers elle-même (ses propres réservations sont déjà bloquées chez elle), tout en
// propageant bien les réservations Airbnb vers Booking.com et inversement. Sans ce paramètre
// (usage historique Superhote), on exclut toutes les sources déjà synchronisées depuis l'extérieur.
//
// Note historique Superhote (legacy, format confirmé par leur support le 2026-08-03) : à l'import,
// seuls DTSTART/DTEND, l'UID (→ code de confirmation) et le SUMMARY (→ prénom/nom, scindé sur
// " - ") sont exploités de façon structurée ; le DESCRIPTION est copié tel quel dans leurs Notes.
// Sans effet connu sur l'import Airbnb/Booking.com (ils ignorent simplement les champs non gérés).
function toIcsDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function foldLine(line: string) {
  // RFC5545 : une ligne ne doit pas dépasser 75 octets, sinon repli sur la ligne suivante avec
  // un espace en début.
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    parts.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ villaId: string }> }) {
  const { villaId } = await params;
  const db = getDb();

  const forPlatform = req.nextUrl.searchParams.get("for");
  const excludedSources =
    forPlatform === "airbnb" || forPlatform === "booking" ? ["superhote", forPlatform] : ["superhote", "airbnb", "booking"];

  const rows = await db
    .select({
      id: reservations.id,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      guestName: reservations.guestName,
      notes: reservations.notes,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villaId),
        ne(reservations.status, "annulee"),
        notInArray(reservations.source, excludedSources),
        gte(reservations.checkOut, new Date())
      )
    )
    .orderBy(reservations.checkIn);

  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moderna Agency//Export Reservations//FR",
    "CALSCALE:GREGORIAN",
  ];

  for (const r of rows) {
    const guestName = r.guestName || "Client Moderna Agency";
    const bookingRef = r.id.slice(0, 8).toUpperCase();
    const description = r.notes?.trim() || "Réservation via l'agent WhatsApp Moderna Agency — aucune demande spécifique.";

    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${r.id}@moderna-agency.vercel.app`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(r.checkIn)}`,
      `DTEND;VALUE=DATE:${toIcsDate(r.checkOut)}`,
      foldLine(`SUMMARY:${escapeIcsText(guestName)} - Direct - ${bookingRef}`),
      foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
