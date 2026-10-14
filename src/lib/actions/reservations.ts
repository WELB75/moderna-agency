"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { getDb } from "@/db";
import { randomBytes } from "node:crypto";
import { reservations, villas } from "@/db/schema";
import { reservationRecaps } from "@/db/schema-recaps";
import { conflitsSejour } from "@/lib/disponibilite";
import { runIcalSync } from "@/lib/ical/sync";
import { nowInMorocco } from "@/lib/now";
import { parseSuperhoteCsv } from "@/lib/superhote-csv";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";
import { beds24UpdateCalendar } from "@/lib/beds24/client";
import { normaliseCanal } from "@/lib/canal";

// Beds24 (inventory/rooms/calendar) : "to" est la DERNIÈRE NUIT incluse, pas le jour du départ.
// Bloquer jusqu'au jour du départ fermait à tort la nuit du départ (ex. résa Kawtar sur AZUR du
// 15 au 17/10/2026 : la nuit du 17 était fermée sur Airbnb). Renvoie null pour 0 nuit.
function derniereNuit(checkIn: string, checkOut: string): string | null {
  const debut = checkIn.slice(0, 10);
  const fin = format(subDays(new Date(`${checkOut.slice(0, 10)}T12:00:00`), 1), "yyyy-MM-dd");
  return fin < debut ? null : fin;
}

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

  // Garde-fou serveur : jamais de réservation directe sur des nuits déjà prises (réservations de
  // l'app, calendrier Beds24 en direct, PriceLabs). Kamel, 2026-10-14 : "si on choisit une date et
  // que c'est pas dispo ça sera impossible à réserver".
  if (new Date(checkOut) <= new Date(checkIn)) {
    throw new Error("Le départ doit être après l'arrivée.");
  }
  const { conflits } = await conflitsSejour(villaId, checkIn, checkOut);
  if (conflits.length > 0) {
    const liste = conflits.slice(0, 4).map((n) => `${n.slice(8, 10)}/${n.slice(5, 7)}`).join(", ");
    throw new Error(`Ces dates ne sont plus disponibles (${liste}${conflits.length > 4 ? "…" : ""}). Choisis d'autres dates.`);
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
    // Bloque pour toute résa saisie à la main SAUF Airbnb : depuis la bascule du 12/10/2026,
    // Airbnb passe par Beds24, la résa y existe déjà. Booking.com est bloqué aussi : pendant la
    // bascule (et pour les villas encore gérées par SuperHote), une résa Booking saisie à la main
    // n'existe pas dans Beds24 et Airbnb restait ouvert (villa AZUR, 13/10/2026).
    const derniere = derniereNuit(checkIn, checkOut);
    if (normaliseCanal(canal || "Direct") !== "airbnb" && villa?.beds24RoomId && derniere) {
      await beds24UpdateCalendar([
        {
          roomId: Number(villa.beds24RoomId),
          // Fermeture "blackout" (case "Remplacer" de Beds24) EN PLUS de numAvail:0. Test Villa
          // Sofya du 14/10/2026 : avec numAvail:0 seul, Booking.com fermait en ~1 min mais
          // Airbnb restait réservable 24 min à 2 h (Beds24 envoyait pourtant bien 0 à Airbnb).
          // Le même jour, un blackout posé sur des dates déjà à numAvail:0 depuis 12 min (et
          // toujours ouvertes sur Airbnb) les a fermées sur Airbnb en moins de 25 secondes.
          calendar: [{ from: checkIn.slice(0, 10), to: derniere, numAvail: 0, override: "blackout" }],
        },
      ]);
    }
  } catch (err) {
    console.error("Échec blocage calendrier Beds24:", err);
  }

  // Récapitulatif partageable (prix PriceLabs, promo, avance, remarque interne) + jeton du lien
  // public /s/[token] — jamais bloquant pour la création elle-même.
  let token: string | null = null;
  try {
    const num = (key: string) => {
      const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
      const n = Number(raw);
      return raw !== "" && Number.isFinite(n) ? n.toFixed(2) : null;
    };
    const promoTypeRaw = String(formData.get("promoType") ?? "");
    const promoType = promoTypeRaw === "pourcentage" || promoTypeRaw === "montant" ? promoTypeRaw : null;
    const modeRaw = String(formData.get("modeReglement") ?? "");
    token = randomBytes(16).toString("hex");
    await db.insert(reservationRecaps).values({
      reservationId: reservation.id,
      token,
      devise: devisePaiement || "EUR",
      prixPricelabs: num("prixPricelabs"),
      promoType: promoType && num("promoValeur") ? promoType : null,
      promoValeur: promoType ? num("promoValeur") : null,
      totalFinal: loyerTotalRaw ? num("loyerTotal") : null,
      avanceVersee: num("avanceVersee"),
      modeReglement: modeRaw === "sur_place" || modeRaw === "virement" ? modeRaw : null,
      remarqueInterne: String(formData.get("remarqueInterne") ?? "").trim() || null,
    });
  } catch (err) {
    console.error("Échec création du récapitulatif de réservation:", err);
    token = null;
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");

  return { id: reservation.id, token };
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

// Nom affiché d'une réservation — Fouad, 2026-10-14, sur une résa Airbnb annulée restée à
// 0 € (Villa Nessya, été 2027) : "laisse Airbnb à la place de Hamza". Pour une réservation
// Beds24, la synchro remet le nom envoyé par le canal à chaque passage : la correction ne tient
// durablement que sur les réservations manuelles ou importées de SuperHote.
export async function updateGuestName(reservationId: string, name: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");
  const nom = name.trim();
  if (!nom) throw new Error("Le nom ne peut pas être vide.");

  const db = getDb();
  await db.update(reservations).set({ guestName: nom, updatedAt: new Date() }).where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath(`/reservations/${reservationId}`);
}

// Note libre sur la réservation (ex. "prévoir un lit bébé") — Kamel, 2026-09-28, relayant une
// question posée en regardant le calendrier Tarification : "c'est possible d'avoir une note ?
// pour les lit bébé etc...". Distincte de notesPaiement (qui ne concerne que le règlement).
export async function updateReservationNotes(reservationId: string, notes: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
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
  // Seulement pour une résa "Direct" : une résa Booking.com saisie à la main peut avoir un
  // doublon réel importé dans Beds24 ; rouvrir les dates en supprimant la copie manuelle
  // risquerait de rouvrir une nuit réellement réservée. Dans ce cas les dates restent bloquées
  // (à rouvrir à la main dans Beds24 si besoin) — on préfère un blocage en trop à un doublon.
  if (reservation?.source === "manuel" && normaliseCanal(reservation.canal) === "direct" && reservation.villaId) {
    try {
      const [villa] = await db.select({ beds24RoomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, reservation.villaId)).limit(1);
      const debut = format(reservation.checkIn, "yyyy-MM-dd");
      const derniere = derniereNuit(debut, format(reservation.checkOut, "yyyy-MM-dd"));
      if (villa?.beds24RoomId && derniere) {
        await beds24UpdateCalendar([
          {
            roomId: Number(villa.beds24RoomId),
            // Lève aussi la fermeture "blackout" posée à la création (voir createReservation).
            calendar: [{ from: debut, to: derniere, numAvail: 1, override: "none" }],
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
  if (!result.success) return { success: false, message: result.error };
  const summary =
    `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s))` +
    (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
    ".";
  // Synchro partielle : affichée en erreur pour que le lien mort ne passe pas inaperçu.
  if (result.failedVillas.length > 0) {
    const failed = result.failedVillas.map((f) => `${f.nom} (${f.reason})`).join(", ");
    return { success: false, message: `${summary} Lien iCal à mettre à jour : ${failed}.` };
  }
  return { success: true, message: summary };
}
