"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { runIcalSync } from "@/lib/ical/sync";
import { nowInMorocco } from "@/lib/now";
import { parseSuperhoteCsv } from "@/lib/superhote-csv";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";
import { beds24UpdateCalendar } from "@/lib/beds24/client";

export async function createReservation(formData: FormData) {
  await auth.protect();

  const villaId = String(formData.get("villaId") ?? "");
  const guestName = toTitleCase(String(formData.get("guestName") ?? "").trim());
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const nbAdultes = Number(formData.get("nbAdultes") ?? 0) || null;
  const nbEnfants = Number(formData.get("nbEnfants") ?? 0) || null;
  const guestsCount = (nbAdultes ?? 0) + (nbEnfants ?? 0) || null;
  const notes = String(formData.get("notes") ?? "").trim();
  // Plateforme d'origine (logos Airbnb/Booking/Direct côté wizard, voir platform-badge.tsx) et
  // prix — optionnels : Kamel, 2026-09-14, l'assistant de création manuelle ne doit pas forcer
  // à tout remplir d'un coup, ces infos peuvent être complétées après coup.
  const canal = String(formData.get("canal") ?? "").trim();
  const loyerTotalRaw = String(formData.get("loyerTotal") ?? "").trim();
  const devisePaiement = String(formData.get("devisePaiement") ?? "").trim();
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "").trim();
  const cautionRaw = String(formData.get("caution") ?? "").trim();
  const fraisMenageRaw = String(formData.get("fraisMenage") ?? "").trim();

  if (!villaId || !guestName || !checkIn || !checkOut) {
    throw new Error("Villa, nom du client, arrivée et départ sont obligatoires.");
  }

  const db = getDb();
  const [reservation] = await db
    .insert(reservations)
    .values({
      villaId,
      guestName,
      guestPhone: guestPhone || null,
      guestEmail: guestEmail || null,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guestsCount,
      nbAdultes,
      nbEnfants,
      notes: notes || null,
      source: "manuel",
      canal: canal || "Direct",
      status: "confirmee",
      loyerTotal: loyerTotalRaw || null,
      devisePaiement: devisePaiement || "EUR",
      moyenPaiement: moyenPaiement || null,
      caution: cautionRaw || null,
      fraisMenage: fraisMenageRaw || null,
    })
    .returning({ id: reservations.id });

  // Sollicitation automatique d'une femme de ménage pour le nettoyage de fin de séjour — ne
  // doit jamais faire échouer la création de la réservation elle-même si ça plante.
  const [villa] = await db.select({ nom: villas.nom, numero: villas.numero, beds24RoomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, villaId)).limit(1);
  try {
    if (villa) await initiateMenageRequest(reservation.id, villa.nom, villa.numero, checkOut.slice(0, 10));
  } catch (err) {
    console.error("Échec initiation demande ménage:", err);
  }

  // Bloque le calendrier Beds24 (répercuté vers Airbnb/Booking.com si la villa y est connectée)
  // — Kamel, 2026-09-15 : "pourquoi Superhote ça bloque le calendrier direct et nous non ?". Une
  // résa "Direct" créée à la main dans l'app n'existe nulle part ailleurs : sans ce blocage, rien
  // n'empêche une double réservation sur les autres canaux. Jamais pour Airbnb/Booking.com saisis
  // à la main : cette résa-là existe déjà côté Beds24 (remontée par runBeds24Sync).
  //
  // Volontairement un blocage de calendrier (numAvail), PAS une vraie réservation Beds24
  // (beds24WriteBookings) : créer un objet "réservation confirmée" puis l'annuler plus tard (à la
  // suppression) déclenche le verrou anti-abus d'Airbnb, qui bloque définitivement les dates
  // d'une réservation annulée côté hôte — vérifié en pratique à deux reprises le 2026-09-14/15.
  // Un blocage de calendrier est un geste hôte normal (fermer/rouvrir des dates), sans
  // réservation associée, donc réversible sans aucun risque.
  try {
    if ((canal || "Direct") === "Direct" && villa?.beds24RoomId) {
      await beds24UpdateCalendar([
        {
          roomId: Number(villa.beds24RoomId),
          calendar: [{ from: checkIn.slice(0, 10), to: checkOut.slice(0, 10), numAvail: 0 }],
        },
      ]);
    }
  } catch (err) {
    console.error("Échec blocage calendrier Beds24:", err);
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");

  return { id: reservation.id };
}

export async function updatePaymentInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) {
    throw new Error("Réservation introuvable.");
  }

  const loyerTotalRaw = String(formData.get("loyerTotal") ?? "").trim();
  const montantPayeRaw = String(formData.get("montantPaye") ?? "").trim();
  const cautionRaw = String(formData.get("caution") ?? "").trim();
  const cautionPayee = formData.get("cautionPayee") === "on";
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "").trim();
  const notesPaiement = String(formData.get("notesPaiement") ?? "").trim();
  const devisePaiement = String(formData.get("devisePaiement") ?? "EUR").trim() || "EUR";

  const loyerTotal = loyerTotalRaw ? Number(loyerTotalRaw.replace(",", ".")).toFixed(2) : null;
  const montantPaye = montantPayeRaw ? Number(montantPayeRaw.replace(",", ".")).toFixed(2) : null;
  const caution = cautionRaw ? Number(cautionRaw.replace(",", ".")).toFixed(2) : null;

  const db = getDb();
  await db
    .update(reservations)
    .set({
      loyerTotal,
      montantPaye,
      caution,
      devisePaiement,
      cautionPayee,
      moyenPaiement: moyenPaiement || null,
      notesPaiement: notesPaiement || null,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Actions rapides pour le check-in physique : Kamel/l'équipe encaisse le solde restant et/ou
// récupère la caution sur place, et veut le noter en un clic plutôt que rouvrir le formulaire
// complet "Paiement" (Kamel, 2026-08-16 : "faut vraiment que j'ai un moyen de cliquer sur un
// bouton"). Solde marqué payé = montant reçu aligné sur le loyer total convenu.
export async function markSoldeRecu(reservationId: string, moyen: "especes" | "virement") {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  const [reservation] = await db.select({ loyerTotal: reservations.loyerTotal }).from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) throw new Error("Réservation introuvable.");

  await db
    .update(reservations)
    .set({
      montantPaye: reservation.loyerTotal,
      moyenPaiement: moyen === "especes" ? "Espèces" : "Virement",
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function markCautionRecue(reservationId: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db.update(reservations).set({ cautionPayee: true, updatedAt: new Date() }).where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Le sync iCal (voir ical/sync.ts) n'écrase plus jamais guestPhone sur une réservation
// existante — volontaire (Superhote exporte souvent un numéro local ambigu "0X..." qui
// écrasait une correction déjà faite à la main), mais ça laissait aucun moyen de corriger le
// numéro ensuite : une correction faite côté Superhote ne remonte donc jamais ici. Kamel,
// 2026-08-20 : "j'ai corrigé sur super hote mais il est toujours marocain dans notre système".
export async function updateGuestPhone(reservationId: string, phone: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({ guestPhone: phone.trim() || null, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath(`/reservations/${reservationId}`);
}

const CHAMP_PAR_TYPE_MESSAGE = {
  arrivee: "messageArriveeEnvoyeAt",
  bienvenue: "messageBienvenueEnvoyeAt",
  localisation: "messageLocalisationEnvoyeAt",
  securite: "messageSecuriteEnvoyeAt",
  cuisine: "messageCuisineEnvoyeAt",
} as const;
export type TypeMessageCheckin = keyof typeof CHAMP_PAR_TYPE_MESSAGE;

// Marque un des 4 boutons WhatsApp de la carte check-in comme envoyé — Kamel, 2026-08-30 : "je
// veux qu'ils passe en mode fond vert au lieu de fond noir". Appelé juste après l'ouverture de
// WhatsApp (voir chaque bouton), jamais bloquant pour l'envoi lui-même si ça échoue.
export async function marquerMessageEnvoye(reservationId: string, type: TypeMessageCheckin) {
  await auth.protect();
  const db = getDb();
  await db
    .update(reservations)
    .set({ [CHAMP_PAR_TYPE_MESSAGE[type]]: new Date() })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath(`/reservations/${reservationId}`);
}

export async function updateOperationalInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({
      assigneCheckin: String(formData.get("assigneCheckin") ?? "").trim() || null,
      formulaireBienvenueEnvoye: formData.get("formulaireBienvenueEnvoye") === "on",
      formulaireCheckinRecu: formData.get("formulaireCheckinRecu") === "on",
      aRelancer: formData.get("aRelancer") === "on",
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function deleteReservation(reservationId: string) {
  await auth.protect();
  const db = getDb();

  const [reservation] = await db
    .select({
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      canal: reservations.canal,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  // Rouvre les dates sur le calendrier Beds24 — seulement pour une résa "Direct" créée à la main
  // dans l'app (voir createReservation, qui bloque le calendrier à la création) : jamais pour une
  // résa Airbnb/Booking.com remontée par runBeds24Sync, dont la suppression ici n'est qu'un
  // ménage local, pas une vraie annulation à répercuter. Toujours via numAvail (blocage de
  // calendrier), jamais via l'annulation d'une réservation Beds24 — voir le commentaire dans
  // createReservation sur le verrou anti-abus d'Airbnb.
  if (reservation?.source === "manuel" && reservation.canal === "Direct" && reservation.villaId) {
    try {
      const [villa] = await db.select({ beds24RoomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, reservation.villaId)).limit(1);
      if (villa?.beds24RoomId) {
        await beds24UpdateCalendar([
          {
            roomId: Number(villa.beds24RoomId),
            calendar: [
              { from: format(reservation.checkIn, "yyyy-MM-dd"), to: format(reservation.checkOut, "yyyy-MM-dd"), numAvail: 1 },
            ],
          },
        ]);
      }
    } catch (err) {
      console.error("Échec réouverture calendrier Beds24 après suppression:", err);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Superhote n'exporte pas toujours l'heure exacte dans son flux iCal (ex. réservations
// Booking.com) : l'app retombe alors sur une heure par défaut (14h/11h) qui peut être fausse.
// Cette action permet de corriger l'heure à la main quand le staff connaît l'heure réelle
// (ex. vue directement dans l'app Superhote).
export async function updateReservationTimes(reservationId: string, checkInTime: string, checkOutTime: string) {
  await auth.protect();

  const [hIn, mIn] = checkInTime.split(":").map(Number);
  const [hOut, mOut] = checkOutTime.split(":").map(Number);
  if ([hIn, mIn, hOut, mOut].some((n) => Number.isNaN(n))) {
    throw new Error("Heure invalide.");
  }

  const db = getDb();
  const [current] = await db
    .select({ checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!current) throw new Error("Réservation introuvable.");

  const newCheckIn = new Date(current.checkIn);
  newCheckIn.setHours(hIn, mIn, 0, 0);
  const newCheckOut = new Date(current.checkOut);
  newCheckOut.setHours(hOut, mOut, 0, 0);

  await db
    .update(reservations)
    .set({ checkIn: newCheckIn, checkOut: newCheckOut, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Confirme que le check-in/check-out a effectivement été fait sur place (distinct de l'heure
// prévue) : garde une trace de qui l'a validé et quand.
export async function validateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const user = await currentUser();
  const validePar = user?.fullName ?? user?.username ?? "Équipe";

  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: nowInMorocco(), checkinValidePar: validePar }
        : { checkoutValideAt: nowInMorocco(), checkoutValidePar: validePar }
    )
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function unvalidateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: null, checkinValidePar: null }
        : { checkoutValideAt: null, checkoutValidePar: null }
    )
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

// L'iCal Superhote ne transmet pas les prix/paiements (limitation du format). Superhote propose
// en revanche un export CSV (Calendriers → Actions → Exporter les réservations) qui les contient :
// on rapproche chaque ligne à une réservation existante par villa + dates de séjour, et on remplit
// loyerTotal/montantPaye automatiquement, plutôt que de les ressaisir une par une à la main.
export async function importSuperhoteCsv(csvText: string) {
  await auth.protect();

  const rows = parseSuperhoteCsv(csvText);
  if (rows.length === 0) throw new Error("Fichier vide ou illisible.");

  const db = getDb();
  const allVillas = await db.select({ id: villas.id, nom: villas.nom }).from(villas);
  const allReservations = await db.select().from(reservations);

  let matched = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const rentalRaw = (row["rental"] ?? "").toLowerCase();
    const villa = allVillas
      .filter((v) => v.nom && rentalRaw.startsWith(v.nom.toLowerCase()))
      .sort((a, b) => b.nom.length - a.nom.length)[0];

    const guestLabel = `${row["guest first name"] ?? ""} ${row["guest last name"] ?? ""}`.trim();
    const checkinRaw = row["checkin"];
    const checkoutRaw = row["checkout"];

    if (!villa || !checkinRaw || !checkoutRaw) {
      unmatched.push(`${guestLabel} (${checkinRaw || "date inconnue"})`);
      continue;
    }

    const checkin = new Date(checkinRaw + "T00:00:00Z");
    const checkout = new Date(checkoutRaw + "T00:00:00Z");
    const reservation = allReservations.find(
      (r) => r.villaId === villa.id && sameCalendarDay(new Date(r.checkIn), checkin) && sameCalendarDay(new Date(r.checkOut), checkout)
    );

    if (!reservation) {
      unmatched.push(`${guestLabel} (${checkinRaw})`);
      continue;
    }

    const totalPrice = row["total price"] ? Number(row["total price"]) : null;
    const totalPayments = row["total payments"] ? Number(row["total payments"]) : null;
    const newStatus = row["status"] === "Cancelled" ? "annulee" : reservation.status;

    await db
      .update(reservations)
      .set({
        loyerTotal: totalPrice !== null && !Number.isNaN(totalPrice) ? totalPrice.toFixed(2) : reservation.loyerTotal,
        montantPaye: totalPayments !== null && !Number.isNaN(totalPayments) ? totalPayments.toFixed(2) : reservation.montantPaye,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservation.id));

    matched++;
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");

  return { matched, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 10) };
}

export async function triggerIcalSync() {
  await auth.protect();
  const result = await runIcalSync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? {
        success: true,
        message:
          `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s))` +
          (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
          ".",
      }
    : { success: false, message: result.error };
}
