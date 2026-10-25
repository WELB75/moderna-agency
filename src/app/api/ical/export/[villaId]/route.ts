import { NextRequest, NextResponse } from "next/server";
import { getUpcomingReservationsForIcal, type IcalReservation } from "@/lib/ical-export";

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
//
// Coût (incident Neon du 2026-10-25) : ce flux est relu ~1 fois/min et par villa par un robot
// externe. Cette route ne touche plus la base elle-même : elle lit la liste commune mise en cache
// par src/lib/ical-export.ts (une requête SQL au plus toutes les 30 min pour tout le projet) et
// filtre en mémoire. Le CDN de Vercel garde en plus sa copie par villa (s-maxage) pour éviter
// d'exécuter la fonction à chaque lecture. Les erreurs ne sont jamais mises en cache et renvoient
// un 503 + Retry-After pour inviter les robots à ralentir au lieu de marteler une base en panne.

/** Après un échec de la base, on répond 503 sans la re-solliciter pendant ce délai (par instance). */
const DB_FAILURE_COOLDOWN_MS = 60_000;
let lastDbFailureAt = 0;

function toIcsDate(iso: string) {
  return iso.slice(0, 10).replace(/-/g, "");
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

function serviceUnavailable() {
  return new NextResponse("Calendrier temporairement indisponible, réessayez plus tard.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Les importateurs iCal bien élevés respectent Retry-After ; dans tous les cas le CDN ne
      // doit jamais conserver une erreur.
      "Retry-After": "900",
      "Cache-Control": "no-store",
    },
  });
}

function buildCalendar(rows: IcalReservation[]) {
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Superhosts//Export Reservations//FR",
    "CALSCALE:GREGORIAN",
  ];

  for (const r of rows) {
    const guestName = r.guestName || "Client Superhosts";
    const bookingRef = r.id.slice(0, 8).toUpperCase();
    const description = r.notes?.trim() || "Réservation via l'agent WhatsApp Superhosts — aucune demande spécifique.";

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
  return lines.join("\r\n") + "\r\n";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ villaId: string }> }) {
  const { villaId } = await params;

  const forPlatform = req.nextUrl.searchParams.get("for");
  const excludedSources =
    forPlatform === "airbnb" || forPlatform === "booking" ? ["superhote", forPlatform] : ["superhote", "airbnb", "booking"];

  if (Date.now() - lastDbFailureAt < DB_FAILURE_COOLDOWN_MS) {
    return serviceUnavailable();
  }

  let all: IcalReservation[];
  try {
    all = await getUpcomingReservationsForIcal();
  } catch (err) {
    lastDbFailureAt = Date.now();
    console.error("[ical/export] lecture des réservations impossible", err);
    return serviceUnavailable();
  }

  // Même sélection que l'ancienne requête SQL, appliquée en mémoire sur la liste commune.
  // (Comme avec NOT IN en SQL, une réservation sans source est exclue : comportement inchangé.)
  const nowMs = Date.now();
  const rows = all.filter(
    (r) =>
      r.villaId === villaId &&
      r.source !== null &&
      !excludedSources.includes(r.source) &&
      Date.parse(r.checkOut) >= nowMs
  );

  return new NextResponse(buildCalendar(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Copie CDN par villa : 10 min de fraîcheur, resservie jusqu'à 30 min de plus pendant que
      // la fonction se rafraîchit en arrière-plan. Derrière, la base n'est plus consultée qu'une
      // fois toutes les 30 min pour l'ensemble des villas (voir src/lib/ical-export.ts).
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=1800",
    },
  });
}
