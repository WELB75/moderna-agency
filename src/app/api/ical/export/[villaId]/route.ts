import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";

// Export iCal des réservations Moderna Agency (source "whatsapp-ia" ou "manuel") pour qu'un
// logement Superhote puisse les importer comme calendrier de blocage — évite les doubles
// réservations sans passer par le tunnel de paiement Stripe qu'exige leur API create-booking
// (confirmé par leur support le 2026-08-03, cf mémoire du projet : cet endpoint ne peut pas
// servir à créer une réservation sans un vrai paiement carte). Volontairement exclu : les
// réservations source="superhote" (déjà importées depuis Superhote via l'autre sens du sync,
// villas.icalUrl) — les réexporter créerait un doublon dans leur propre calendrier.
function toIcsDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function foldLine(line: string) {
  // RFC5545 : une ligne ne doit pas dépasser 75 octets, sinon repli sur la ligne suivante avec
  // un espace en début — improbable ici vu la longueur de nos lignes, mais gardé par prudence.
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

  const rows = await db
    .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut, guestName: reservations.guestName })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villaId),
        ne(reservations.status, "annulee"),
        ne(reservations.source, "superhote"),
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
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${r.id}@moderna-agency.vercel.app`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(r.checkIn)}`,
      `DTEND;VALUE=DATE:${toIcsDate(r.checkOut)}`,
      "SUMMARY:Réservé - Moderna Agency",
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
