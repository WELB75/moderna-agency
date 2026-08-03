import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";

// Export iCal des réservations Moderna Agency (source "whatsapp-ia" ou "manuel") pour qu'un
// logement Superhote puisse les importer comme calendrier de blocage — évite les doubles
// réservations sans passer par le tunnel de paiement Stripe qu'exige leur API create-booking
// (confirmé par leur support le 2026-08-03, cf mémoire du projet : cet endpoint ne peut pas
// servir à créer une réservation sans un vrai paiement carte). Volontairement exclu : les
// réservations source="superhote" (déjà importées depuis Superhote via l'autre sens du sync,
// villas.icalUrl) — les réexporter créerait un doublon dans leur propre calendrier.
//
// Format SUMMARY/DESCRIPTION calqué exactement sur celui de Superhote lui-même (voir
// src/lib/ical/parse.ts, qui lit LEUR export du même format) — un premier test réel a confirmé
// que leur import scinde le SUMMARY sur " - " pour en tirer prénom/nom, donc mimer leur
// convention permet à leur import de remplir les vraies infos client plutôt qu'un blocage vide.
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatSuperhoteDateTime(d: Date, hour: number, minute: number) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTHS_EN[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const h = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return `${day} ${month} ${year} ${h}:${mi}`;
}

function toIcsDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
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

  const rows = await db
    .select({
      id: reservations.id,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      guestPhone: reservations.guestPhone,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      villaNom: villas.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(villas.id, reservations.villaId))
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
    const guestName = r.guestName || "Client Moderna Agency";
    const descriptionLines = [
      `Arriving - ${formatSuperhoteDateTime(r.checkIn, 15, 0)}`,
      `Departing - ${formatSuperhoteDateTime(r.checkOut, 11, 0)}`,
      `Number of Adults - ${r.nbAdultes ?? ""}`,
      `Number of Children - ${r.nbEnfants ?? 0}`,
      `Guest Email - ${r.guestEmail ?? ""}`,
      `Guest Phone - ${r.guestPhone ?? ""}`,
      `Rental Name - ${r.villaNom ?? ""}`,
    ].join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${r.id}@moderna-agency.vercel.app`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(r.checkIn)}`,
      `DTEND;VALUE=DATE:${toIcsDate(r.checkOut)}`,
      foldLine(`SUMMARY:${escapeIcsText(guestName)} - Direct - ${r.id}`),
      foldLine(`DESCRIPTION:${escapeIcsText(descriptionLines)}`),
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
