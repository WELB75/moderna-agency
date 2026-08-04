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
//
// Format confirmé par le support Superhote (2026-08-03) : à l'import, seuls DTSTART/DTEND,
// l'UID (→ code de confirmation) et le SUMMARY (→ prénom/nom, scindé sur " - ") sont exploités
// de façon structurée. Le DESCRIPTION, lui, est copié TEL QUEL dans le champ Notes de la
// réservation (aucune étiquette/convention à respecter) — d'où son usage ici : les demandes
// spécifiques du client (cuisinière, lit bébé...), pas des champs structurés qui ne seraient de
// toute façon pas reconnus (email/téléphone/nb voyageurs restent ignorés, nb adultes est même
// forcé à 0 côté Superhote quoi qu'on envoie).
//
// ⚠️ Important, à répercuter à l'équipe : la synchro iCal supprime puis recrée les réservations
// à chaque passage. Toute note ajoutée à la main dans Superhote sur une réservation issue de cet
// export sera donc écrasée à la synchro suivante — le DESCRIPTION de ce flux doit rester la seule
// source de vérité pour ces réservations-là.
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
