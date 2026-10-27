"use server";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { domaines, reservations, villas } from "@/db/schema";
import { beds24GetBookings, beds24GetMessages } from "@/lib/beds24/client";
import { fichesPourAgent } from "@/lib/messages-agent/memoire";
import { suggererReponse, type ContexteLogement, type ContexteSejour, type FilMessage, type SuggestionReponse } from "@/lib/messages-agent/suggestion";

const colonnesLogement = {
  nom: villas.nom,
  numero: villas.numero,
  type: villas.type,
  description: villas.description,
  adresse: villas.adresse,
  domaineNom: domaines.nom,
  domaineAdresse: domaines.adresse,
  mapsUrl: domaines.mapsUrl,
  wazeUrl: domaines.wazeUrl,
  codeBoitier: villas.codeBoitier,
  codePorteEntree: villas.codePorteEntree,
  codeWifi: villas.codeWifi,
  guideBienvenueUrl: villas.guideBienvenueUrl,
  baseConnaissances: villas.baseConnaissances,
  repasInclusDansLoyer: villas.repasInclusDansLoyer,
};

type LigneLogement = {
  [K in keyof typeof colonnesLogement]: (typeof colonnesLogement)[K] extends { _: { data: infer D } } ? D : never;
};

function versContexteLogement(l: LigneLogement): ContexteLogement {
  return {
    nom: l.nom,
    numero: l.numero,
    type: l.type,
    description: l.description,
    adresse: l.adresse ?? l.domaineAdresse,
    domaineNom: l.domaineNom,
    mapsUrl: l.mapsUrl,
    wazeUrl: l.wazeUrl,
    codeBoitier: l.codeBoitier,
    codePorteEntree: l.codePorteEntree,
    codeWifi: l.codeWifi,
    guideBienvenueUrl: l.guideBienvenueUrl,
    baseConnaissances: l.baseConnaissances,
    repasInclusDansLoyer: l.repasInclusDansLoyer,
  };
}

// Brouillon de réponse de l'agent IA pour un fil Airbnb / Booking.com — l'identifiant de la
// réservation (ou de la demande d'information) sert à retrouver tout le contexte CÔTÉ SERVEUR :
// rien de ce que le navigateur enverrait (codes, villa...) n'est pris tel quel. Rien n'est envoyé
// au voyageur ici : c'est un simple brouillon que l'équipe relit.
export async function suggererReponseIA(cible: { reservationId?: string | null; beds24InquiryId?: number | null }): Promise<SuggestionReponse> {
  await auth.protect();
  const db = getDb();

  let sejour: ContexteSejour;
  let bookingId: number;

  if (cible.reservationId) {
    const [row] = await db
      .select({
        ...colonnesLogement,
        beds24BookingId: reservations.beds24BookingId,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        canal: reservations.canal,
        status: reservations.status,
        guestsCount: reservations.guestsCount,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(eq(reservations.id, cible.reservationId))
      .limit(1);
    if (!row?.beds24BookingId) throw new Error("Cette réservation n'est pas liée à un canal Beds24.");
    bookingId = Number(row.beds24BookingId);
    sejour = {
      reservation: {
        guestName: row.guestName,
        checkIn: new Date(row.checkIn),
        checkOut: new Date(row.checkOut),
        canal: row.canal,
        annulee: row.status === "annulee",
        nbVoyageurs: row.guestsCount,
      },
      logement: row.nom ? versContexteLogement(row as LigneLogement) : null,
    };
  } else if (cible.beds24InquiryId && Number.isInteger(cible.beds24InquiryId) && cible.beds24InquiryId > 0) {
    // Demande d'information : même vérification que l'envoi (une vraie demande, sur un logement
    // de l'agence). Aucun code ni wifi : le voyageur n'a pas réservé.
    const [booking] = await beds24GetBookings({ id: cible.beds24InquiryId, status: ["inquiry", "request"] });
    if (!booking) throw new Error("Cette demande n'existe plus dans Beds24.");
    const [row] = await db
      .select(colonnesLogement)
      .from(villas)
      .leftJoin(domaines, eq(villas.domaineId, domaines.id))
      .where(eq(villas.beds24RoomId, String(booking.roomId)))
      .limit(1);
    if (!row) throw new Error("Cette demande ne concerne pas un logement de l'agence.");
    bookingId = booking.id;
    sejour = { reservation: null, logement: versContexteLogement(row as LigneLogement) };
  } else {
    throw new Error("Conversation sans canal de réponse.");
  }

  const messages = await beds24GetMessages(bookingId);
  const fil: FilMessage[] = [...messages]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .filter((m) => (m.message ?? "").trim())
    .map((m) => ({ deVoyageur: m.source === "guest", texte: m.message }));
  if (!fil.some((m) => m.deVoyageur)) throw new Error("Aucun message du voyageur à qui répondre.");

  return suggererReponse({ ...sejour, memoire: await fichesPourAgent() }, fil);
}
