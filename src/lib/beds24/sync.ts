import { and, asc, eq, isNotNull, isNull, gte, lt, inArray, notInArray } from "drizzle-orm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getDb } from "@/db";
import { villas, reservations, gendarmerieForms, pricelabsPriceCache } from "@/db/schema";
import {
  beds24AddInfoItems,
  beds24GetBookings,
  beds24GetProperties,
  beds24WriteBookings,
  type Beds24Booking,
  type Beds24BookingWrite,
} from "@/lib/beds24/client";
import { nowInMorocco } from "@/lib/now";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";
import { getBaseUrl } from "@/lib/base-url";
import { estDirham, getMadParEur, madVersEur, MAD_PAR_EUR_SECOURS } from "@/lib/devises";
import { BEDS24_VILLA_MAPPING } from "@/lib/beds24/mapping";
import { sejourSansVoyageur } from "@/lib/conditions-sejour";
import { AUTEUR_SYNCHRO_BEDS24, journaliser } from "@/lib/journal";

// Réservations vraiment actives côté Beds24 ; "request"/"inquiry"/"black" ne sont pas des
// séjours réels (demande en attente, blocage manuel) et ne doivent pas apparaître dans l'app.
const ACTIVE_STATUSES = new Set(["confirmed", "new"]);
const CANCELLED_STATUSES = new Set(["cancelled"]);

// Sans filtre de date, GET /bookings ne renvoie que les séjours en cours/à venir : on remonte
// aussi les séjours terminés depuis moins de 30 jours (ménage, caution, fiche police...).
const PAST_DAYS_INCLUDED = 30;

// Sources des réservations importées par les anciennes synchros iCal (SuperHote, flux natifs
// Airbnb/Booking.com) : à la bascule, la même réservation remonte maintenant par Beds24. On
// rattache alors la ligne existante (voir findPreBeds24Duplicate) au lieu d'en créer une seconde.
// Jamais "manuel" : une résa Direct saisie dans l'app ne fait que bloquer le calendrier Beds24.
const PRE_BEDS24_SOURCES = ["superhote", "airbnb", "booking"];

// Beds24 ne donne qu'une date (pas d'heure) pour l'arrivée/le départ : on retombe sur les
// horaires standards de l'agence, modifiables ensuite comme pour toute autre réservation.
const DEFAULT_CHECKIN_HOUR = 15;
const DEFAULT_CHECKOUT_HOUR = 11;

// Construit la date explicitement via Date.UTC plutôt qu'un parsing de chaîne (dont le résultat
// dépend du fuseau horaire de la machine qui exécute le code) — même logique que nowInMorocco() :
// l'heure "affichée" (Maroc) est stockée telle quelle, sans conversion de fuseau.
function toDateTime(dateOnly: string, hour: number): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Caution par lien Stripe — Fouad, 2026-10-16 : "je veux que ça nous indique si la caution a été
// payée ou non via le lien". Quand le voyageur valide l'empreinte bancaire (lien bookpay.php
// envoyé par les actions automatiques "Caution ... - lien J-1 10h"), Beds24 ajoute l'info code
// STRIPEAUTHORIZE à la réservation — c'est aussi ce code qui empêche le rappel du jour J de
// partir. La synchro le lit pour cocher "caution reçue" sans intervention.
export const STRIPE_AUTORISATION_INFO_CODE = "STRIPEAUTHORIZE";

export function cautionAutoriseeParStripe(booking: Beds24Booking): boolean {
  return (booking.infoItems ?? []).some((item) => item.code === STRIPE_AUTORISATION_INFO_CODE);
}

// Montant de caution demandé par Beds24 pour ce séjour : celui du groupe de la propriété (voir
// mapping.ts), seulement pour Booking.com et Direct — les actions caution ne partent jamais pour
// Airbnb, qui n'a donc pas de caution à suivre.
// Réservation Beds24 qui ne correspond à aucun voyageur ("Blocage Airbnb", dates fermées...) : pas
// de caution à attendre.
const NOM_BLOCAGE_BEDS24 = /^(blocage|date bloqu|not available|blocked|indisponible)/i;

function cautionPrevue(roomId: string, canal: string | null, guestName: string): string | null {
  if ((canal ?? "").toLowerCase().includes("airbnb")) return null;
  if (NOM_BLOCAGE_BEDS24.test(guestName.trim())) return null;
  const mapping = BEDS24_VILLA_MAPPING.find((m) => String(m.roomId) === roomId);
  return mapping ? String(mapping.caution) : null;
}

// Canal normalisé sur les libellés déjà utilisés dans l'app ("Airbnb", "Booking.com", "Direct",
// reconnus par platformFromCanal). Beds24 expose un code technique (channel : "airbnb",
// "booking"...) et un libellé (referer : "Airbnb", "Booking.com"...), parfois l'un sans l'autre.
// On ne cherche pas "booking" seul dans referer : "Beds24 booking page" est une résa directe.
function mapCanal(booking: Beds24Booking): string {
  const channel = (booking.channel ?? "").trim().toLowerCase();
  const referer = (booking.referer ?? "").trim();
  const refererLower = referer.toLowerCase();

  if (channel.includes("airbnb") || refererLower.includes("airbnb")) return "Airbnb";
  if (channel === "booking" || channel === "bookingcom" || channel.includes("booking.com") || refererLower.includes("booking.com")) {
    return "Booking.com";
  }
  if (!channel || channel === "direct") return "Direct";
  // Autre OTA (Vrbo, Expedia...) : on garde le libellé Beds24 tel quel.
  return referer || booking.channel || "Direct";
}

// Beds24 donne le prix sans devise : c'est celle de la propriété. Sans devise connue, on ne
// touche à rien.
function mapDevise(currency: string | undefined): string | null {
  const code = (currency ?? "").trim().toUpperCase();
  return code || null;
}

type ConversionLoyer = { deviseOrigine: "MAD"; montantOrigine: number; madParEur: number };

// Loyer toujours enregistré en euros, comme pour toutes les villas (Fouad, 2026-10-15 : Villa
// Wimiliim affichait "6216,00 €" pour 6216 MAD). Un montant est en dirhams quand :
// - la propriété Beds24 est en MAD ;
// - ou c'est une résa Airbnb dont le montant par nuit dépasse 5x le prix minimum PriceLabs du
//   logement (en euros) : l'annonce Airbnb de Wimiliim est tarifée en dirhams et Airbnb transmet
//   le montant dans la devise de l'annonce, alors que la propriété Beds24 et PriceLabs sont en
//   euros. Un loyer en euros reste sous ~2x le minimum par nuit (relevé du 15/10/2026 : 1,8x au
//   plus sur toutes les résas Airbnb), un loyer en dirhams dépasse ~6x (≈ 11 MAD pour 1 €,
//   moins les frais Airbnb) ;
// - ou ce même montant a déjà été converti à une synchro précédente (l'annonce peut repasser en
//   euros plus tard, une ancienne résa reste en dirhams chez Beds24).
// Le montant d'origine et le taux sont gardés dans rawData ; le taux est réutilisé tant que le
// montant ne change pas, pour que le loyer ne bouge pas d'une synchro à l'autre.
async function loyerEnEuros(
  booking: Beds24Booking,
  contexte: {
    canal: string;
    deviseBeds24: string | undefined;
    devisePricelabs: string | null;
    minPricelabs: number | null;
    nuits: number;
    precedent: unknown;
  }
): Promise<{ loyerTotal: string | null; devise: string | undefined; conversion: ConversionLoyer | null }> {
  const prix = Number(booking.price) || 0;
  if (prix <= 0) return { loyerTotal: null, devise: estDirham(contexte.deviseBeds24) ? "EUR" : contexte.deviseBeds24, conversion: null };

  const precedente = (contexte.precedent as { conversion?: Partial<ConversionLoyer> } | null)?.conversion;
  const memeMontant = precedente?.deviseOrigine === "MAD" && precedente.montantOrigine === prix && Number(precedente.madParEur) > 0;
  const parNuit = prix / Math.max(1, contexte.nuits);
  const minEuros = contexte.minPricelabs
    ? estDirham(contexte.devisePricelabs)
      ? contexte.minPricelabs / MAD_PAR_EUR_SECOURS
      : contexte.minPricelabs
    : null;
  const annonceAirbnbEnDirhams = contexte.canal === "Airbnb" && minEuros != null && parNuit >= minEuros * 5;
  const enDirhams = estDirham(contexte.deviseBeds24) || annonceAirbnbEnDirhams || memeMontant;
  if (!enDirhams) return { loyerTotal: prix.toFixed(2), devise: contexte.deviseBeds24, conversion: null };

  const madParEur = memeMontant ? Number(precedente!.madParEur) : await getMadParEur();
  return {
    loyerTotal: madVersEur(prix, madParEur).toFixed(2),
    devise: "EUR",
    conversion: { deviseOrigine: "MAD", montantOrigine: prix, madParEur },
  };
}

function mapPhone(booking: Beds24Booking): string | null {
  const phone = (booking.mobile || booking.phone || "").trim();
  return phone || null;
}

// Ligne existante (importée avant la bascule) correspondant au même séjour : même villa, mêmes
// jours d'arrivée et de départ, pas encore rattachée à Beds24.
async function findPreBeds24Duplicate(villaId: string, booking: Beds24Booking) {
  const db = getDb();
  const arrivalStart = toDateTime(booking.arrival, 0);
  const departureStart = toDateTime(booking.departure, 0);
  const [row] = await db
    .select({
      id: reservations.id,
      guestPhone: reservations.guestPhone,
      guestEmail: reservations.guestEmail,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      guestsCount: reservations.guestsCount,
      caution: reservations.caution,
      cautionPayee: reservations.cautionPayee,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.villaId, villaId),
        isNull(reservations.beds24BookingId),
        inArray(reservations.source, PRE_BEDS24_SOURCES),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkIn, arrivalStart),
        lt(reservations.checkIn, new Date(arrivalStart.getTime() + DAY_MS)),
        gte(reservations.checkOut, departureStart),
        lt(reservations.checkOut, new Date(departureStart.getTime() + DAY_MS))
      )
    )
    .limit(1);
  return row ?? null;
}

// Ne synchronise que les villas explicitement migrées vers Beds24 (beds24RoomId renseigné) —
// tant qu'une villa n'a pas ce champ, elle continue de fonctionner exactement comme avant
// (iCal Superhote), cette fonction n'y touche pas. Appelée par le bouton du tableau de bord, le
// webhook Beds24 (/api/beds24/webhook) et le cron quotidien (/api/beds24/sync).
export async function runBeds24Sync(): Promise<
  | { success: true; bookingsSynced: number; villasSynced: number; bookingsCancelled: number; bookingsAdopted: number }
  | { success: false; error: string }
> {
  const db = getDb();

  const rows = await db
    .select({
      id: villas.id,
      nom: villas.nom,
      numero: villas.numero,
      beds24RoomId: villas.beds24RoomId,
      beds24PropertyId: villas.beds24PropertyId,
      devisePricelabs: pricelabsPriceCache.currency,
      minPricelabs: pricelabsPriceCache.minPrice,
    })
    .from(villas)
    .leftJoin(pricelabsPriceCache, eq(pricelabsPriceCache.villaId, villas.id))
    .where(isNotNull(villas.beds24RoomId));

  type VillaBeds24 = (typeof rows)[number] & { beds24RoomId: string };
  const targets = rows.filter((v): v is VillaBeds24 => Boolean(v.beds24RoomId));

  if (targets.length === 0) {
    return { success: false, error: "Aucune villa n'est encore connectée à Beds24." };
  }

  let totalSynced = 0;
  let totalCancelled = 0;
  let totalAdopted = 0;
  const now = nowInMorocco();
  const departureFrom = new Date(now.getTime() - PAST_DAYS_INCLUDED * DAY_MS).toISOString().slice(0, 10);
  const newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[] = [];
  const cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[] = [];

  try {
    // Un seul appel (paginé) pour toutes les chambres connectées, plutôt qu'un appel par villa.
    const roomIds: number[] = Array.from(new Set(targets.map((v) => Number(v.beds24RoomId))));
    const allBookings = await beds24GetBookings({
      roomId: roomIds,
      departureFrom,
      status: ["new", "confirmed", "cancelled"],
      includeInfoItems: true,
    });
    // Devise du loyer par propriété (le prix Beds24 n'en porte pas) : sans ça, un montant en
    // dirhams restait étiqueté "EUR" par défaut. Si la lecture échoue, on garde la devise actuelle.
    const deviseParPropriete = new Map<string, string>();
    try {
      for (const property of await beds24GetProperties()) {
        const devise = mapDevise(property.currency);
        if (devise) deviseParPropriete.set(String(property.id), devise);
      }
    } catch {
      // non bloquant
    }
    const bookingsByRoom = new Map<number, Beds24Booking[]>();
    for (const booking of allBookings) {
      const list = bookingsByRoom.get(booking.roomId) ?? [];
      list.push(booking);
      bookingsByRoom.set(booking.roomId, list);
    }

    for (const villa of targets) {
      const bookings = bookingsByRoom.get(Number(villa.beds24RoomId)) ?? [];
      const deviseVilla = villa.beds24PropertyId ? deviseParPropriete.get(villa.beds24PropertyId) : undefined;
      const seenIds: string[] = [];

      for (const booking of bookings) {
        const bookingId = String(booking.id);
        const isCancelled = CANCELLED_STATUSES.has(booking.status);
        if (!isCancelled && !ACTIVE_STATUSES.has(booking.status)) continue; // demande/blocage, pas un vrai séjour

        seenIds.push(bookingId);
        const guestName = toTitleCase(`${booking.firstName ?? ""} ${booking.lastName ?? ""}`.trim() || "Réservation Beds24");
        const checkIn = toDateTime(booking.arrival, DEFAULT_CHECKIN_HOUR);
        const checkOut = toDateTime(booking.departure, DEFAULT_CHECKOUT_HOUR);
        const guestPhone = mapPhone(booking);
        const canalBooking = mapCanal(booking);

        const [existing] = await db
          .select({
            id: reservations.id,
            guestPhone: reservations.guestPhone,
            canal: reservations.canal,
            rawData: reservations.rawData,
            caution: reservations.caution,
            cautionPayee: reservations.cautionPayee,
          })
          .from(reservations)
          .where(eq(reservations.beds24BookingId, bookingId))
          .limit(1);

        // Canal corrigé à la main dans l'app (résa Airbnb arrivée "Direct" par iCal) : c'est lui
        // qui compte pour savoir dans quelle devise Airbnb a transmis le montant.
        const canalEffectif = canalBooking === "Direct" && existing?.canal && existing.canal !== "Direct" ? existing.canal : canalBooking;
        const loyer = await loyerEnEuros(booking, {
          canal: canalEffectif,
          deviseBeds24: deviseVilla,
          devisePricelabs: villa.devisePricelabs,
          minPricelabs: villa.minPricelabs ? Number(villa.minPricelabs) : null,
          nuits: Math.round((toDateTime(booking.departure, 0).getTime() - toDateTime(booking.arrival, 0).getTime()) / DAY_MS),
          precedent: existing?.rawData ?? null,
        });

        // Caution : montant rempli seulement s'il est vide (un montant saisi à la main dans l'app
        // reste prioritaire), et "reçue" ne repasse jamais à faux toute seule (caution encaissée
        // autrement, cochée à la main).
        const montantCaution = cautionPrevue(villa.beds24RoomId, canalEffectif, guestName);
        const stripeAutorise = cautionAutoriseeParStripe(booking);

        const values = {
          villaId: villa.id,
          beds24BookingId: bookingId,
          guestName,
          guestEmail: booking.email || null,
          guestPhone,
          checkIn,
          checkOut,
          nbAdultes: booking.numAdult ?? null,
          nbEnfants: booking.numChild ?? null,
          guestsCount: (booking.numAdult ?? 0) + (booking.numChild ?? 0) || null,
          canal: canalBooking,
          ...(loyer.devise ? { devisePaiement: loyer.devise } : {}),
          status: isCancelled ? ("annulee" as const) : ("confirmee" as const),
          source: "beds24" as const,
          loyerTotal: loyer.loyerTotal,
          // Airbnb encaisse le voyageur lui-même : le loyer est déjà payé, il n'y a pas de solde à
          // recevoir sur place (Kamel, 2026-10-18) — et il doit compter dans l'encaissé des stats.
          ...(!isCancelled && loyer.loyerTotal && canalEffectif.toLowerCase().includes("airbnb")
            ? { montantPaye: loyer.loyerTotal }
            : {}),
          rawData: {
            beds24Status: booking.status,
            beds24Channel: booking.channel ?? null,
            beds24Referer: booking.referer ?? null,
            ...(loyer.conversion ? { conversion: loyer.conversion } : {}),
          },
          updatedAt: new Date(),
        };

        if (existing) {
          // Téléphone : comme pour la synchro iCal, un numéro corrigé à la main dans l'app ne
          // doit pas être écrasé par la valeur brute du canal — on ne fait que compléter.
          // Canal : une résa Airbnb importée par iCal arrive étiquetée "direct" côté Beds24 ; si le
          // canal a été corrigé à la main (Airbnb, Booking.com...), on ne le remet pas à Direct.
          const canal = values.canal === "Direct" && existing.canal && existing.canal !== "Direct" ? existing.canal : values.canal;
          await db
            .update(reservations)
            .set({
              ...values,
              canal,
              guestPhone: existing.guestPhone ?? values.guestPhone,
              caution: existing.caution ?? montantCaution,
              cautionPayee: existing.cautionPayee || stripeAutorise,
            })
            .where(eq(reservations.id, existing.id));
          totalSynced += 1;
          continue;
        }

        // Bascule SuperHote -> Beds24 : même séjour déjà importé par l'ancienne synchro iCal ?
        // On le rattache (en gardant ménage/cuisine déjà affectés, messages envoyés, etc.) au
        // lieu de créer un doublon. Les infos corrigées à la main (téléphone, nombre de
        // voyageurs, email) sont conservées, Beds24 ne fait que compléter les champs vides.
        const duplicate = isCancelled ? null : await findPreBeds24Duplicate(villa.id, booking);
        if (duplicate) {
          await db
            .update(reservations)
            .set({
              ...values,
              guestPhone: duplicate.guestPhone ?? values.guestPhone,
              guestEmail: duplicate.guestEmail ?? values.guestEmail,
              nbAdultes: duplicate.nbAdultes ?? values.nbAdultes,
              nbEnfants: duplicate.nbEnfants ?? values.nbEnfants,
              guestsCount: duplicate.guestsCount ?? values.guestsCount,
              caution: duplicate.caution ?? montantCaution,
              cautionPayee: duplicate.cautionPayee || stripeAutorise,
            })
            .where(eq(reservations.id, duplicate.id));
          totalAdopted += 1;
          totalSynced += 1;
          continue;
        }

        // onConflictDoNothing : le webhook peut déclencher deux synchros simultanées ; la
        // seconde ne doit ni planter sur l'index unique ni notifier deux fois.
        const [inserted] = await db
          .insert(reservations)
          .values({ ...values, caution: montantCaution, cautionPayee: stripeAutorise })
          .onConflictDoNothing({ target: reservations.beds24BookingId })
          .returning({ id: reservations.id });
        totalSynced += 1;

        // Journal "qui a fait quoi" : cette réservation est arrivée toute seule par Beds24
        // (Airbnb, Booking.com, iCal...), pas par une personne de l'équipe.
        if (inserted && !isCancelled) {
          await journaliser({
            action: "creation",
            auteur: AUTEUR_SYNCHRO_BEDS24,
            reservationId: inserted.id,
            villaId: villa.id,
            villaNom: villa.nom,
            resume: `${guestName} · ${canalBooking} · du ${booking.arrival} au ${booking.departure} · Beds24 n°${bookingId}${booking.referer ? ` (${booking.referer})` : ""}`,
          });
        }

        // Séjour déjà terminé (remonté par departureFrom) : pas de notification ni de ménage.
        if (!inserted || isCancelled || checkOut < now) continue;

        newBookings.push({ villaNom: villa.nom, guestName, checkIn, checkOut });
        // Sollicitation automatique d'une femme de ménage, comme pour la synchro iCal qu'on
        // remplace — ne doit jamais faire échouer la synchro elle-même si ça plante.
        try {
          await initiateMenageRequest(inserted.id, villa.nom, villa.numero, booking.departure);
        } catch (err) {
          console.error("Échec initiation demande ménage (sync Beds24):", err);
        }
      }

      // Réconciliation : une réservation encore "confirmée" à venir pour cette villa mais
      // absente de la réponse Beds24 actuelle a été annulée côté Beds24.
      const cancelledFilter = and(
        eq(reservations.villaId, villa.id),
        eq(reservations.source, "beds24"),
        eq(reservations.status, "confirmee"),
        gte(reservations.checkOut, now),
        ...(seenIds.length > 0 ? [notInArray(reservations.beds24BookingId, seenIds)] : [])
      );

      const cancelled = await db
        .update(reservations)
        .set({ status: "annulee", updatedAt: new Date() })
        .where(cancelledFilter)
        .returning({
          id: reservations.id,
          guestName: reservations.guestName,
          canal: reservations.canal,
          beds24BookingId: reservations.beds24BookingId,
          checkIn: reservations.checkIn,
          checkOut: reservations.checkOut,
        });
      totalCancelled += cancelled.length;
      cancelled.forEach((c) => cancelledBookings.push({ villaNom: villa.nom, guestName: c.guestName, checkIn: c.checkIn }));
      for (const c of cancelled) {
        await journaliser({
          action: "annulation",
          auteur: AUTEUR_SYNCHRO_BEDS24,
          reservationId: c.id,
          villaId: villa.id,
          villaNom: villa.nom,
          resume: `${c.guestName}${c.canal ? ` · ${c.canal}` : ""} · du ${format(c.checkIn, "dd/MM/yyyy")} au ${format(c.checkOut, "dd/MM/yyyy")} · annulée dans Beds24${c.beds24BookingId ? ` (n°${c.beds24BookingId})` : ""}`,
        });
      }
    }

    // Lien fiche police de chaque séjour à venir, publié dans Beds24 pour le message automatique.
    // Jamais bloquant : en cas d'échec, la synchro des réservations reste valide.
    try {
      await publierLiensFichePolice(allBookings, now);
    } catch (err) {
      console.error("Échec publication des liens fiche police (Beds24):", err);
    }

    await notifySyncChanges(newBookings, cancelledBookings);

    return {
      success: true,
      bookingsSynced: totalSynced,
      villasSynced: targets.length,
      bookingsCancelled: totalCancelled,
      bookingsAdopted: totalAdopted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inattendue lors de la synchronisation Beds24.";
    return { success: false, error: message };
  }
}

// Fiche police automatique — Fouad, 2026-10-13 : "J'aimerais que tu leur envoies le lien pour
// qu'ils puissent scanner leur passeport [...] et que ça envoie un message automatique".
// Pour chaque séjour Beds24 à venir : une fiche police (gendarmerieForms) est créée si besoin, et
// son lien public /g/[id] est écrit dans la réservation Beds24 en info item FICHEPOLICE. Le
// message automatique Beds24 l'insère avec [BOOKINGINFOCODETEXT:FICHEPOLICE] (filtre "info
// code" = FICHEPOLICE, pour ne jamais partir sans lien). Une seule écriture par réservation : on
// ne réécrit pas si l'info item existe déjà.
export const FICHE_POLICE_INFO_CODE = "FICHEPOLICE";

async function publierLiensFichePolice(bookings: Beds24Booking[], now: Date): Promise<void> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return;
  const db = getDb();
  const aPublier: { id: number; infoItems: { code: string; text: string }[] }[] = [];

  for (const booking of bookings) {
    if (!ACTIVE_STATUSES.has(booking.status)) continue;
    if (toDateTime(booking.departure, DEFAULT_CHECKOUT_HOUR) < now) continue;
    if ((booking.infoItems ?? []).some((item) => item.code === FICHE_POLICE_INFO_CODE)) continue;

    const [resa] = await db
      .select({ id: reservations.id, villaId: reservations.villaId, guestName: reservations.guestName, canal: reservations.canal })
      .from(reservations)
      .where(eq(reservations.beds24BookingId, String(booking.id)))
      .limit(1);
    if (!resa) continue;
    // Blocage / travaux / séjour Famille : aucun voyageur à enregistrer, pas de fiche (Fouad,
    // 2026-10-18 : "Blocage Airbnb", "Travaux Azur"... gonflaient les fiches "en attente").
    if (sejourSansVoyageur(resa)) continue;

    // Fiche déjà créée à la main depuis la réservation : on réutilise la plus ancienne.
    let [fiche] = await db
      .select({ id: gendarmerieForms.id })
      .from(gendarmerieForms)
      .where(eq(gendarmerieForms.reservationId, resa.id))
      .orderBy(asc(gendarmerieForms.createdAt))
      .limit(1);
    if (!fiche) {
      [fiche] = await db
        .insert(gendarmerieForms)
        .values({ reservationId: resa.id, villaId: resa.villaId, createdByName: "Beds24 (automatique)" })
        .returning({ id: gendarmerieForms.id });
    }
    if (!fiche) continue;

    aPublier.push({ id: booking.id, infoItems: [{ code: FICHE_POLICE_INFO_CODE, text: `${baseUrl}/g/${fiche.id}` }] });
  }

  for (let i = 0; i < aPublier.length; i += 50) {
    await beds24AddInfoItems(aPublier.slice(i, i + 50));
  }
}

async function notifySyncChanges(
  newBookings: { villaNom: string; guestName: string; checkIn: Date; checkOut: Date }[],
  cancelledBookings: { villaNom: string; guestName: string; checkIn: Date }[]
) {
  if (newBookings.length === 0 && cancelledBookings.length === 0) return;

  const lines: string[] = [];
  for (const b of newBookings) {
    lines.push(
      `Nouvelle réservation (Beds24) : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })} → ${format(b.checkOut, "d MMM", { locale: fr })})`
    );
  }
  for (const b of cancelledBookings) {
    lines.push(`Annulation (Beds24) : ${b.villaNom} — ${b.guestName} (${format(b.checkIn, "d MMM", { locale: fr })})`);
  }

  await notifyStaffWhatsApp(lines.join("\n")).catch(() => {});
}

// Sens app -> Beds24 : pousse une réservation créée/modifiée dans l'app vers Beds24, mais
// uniquement si sa villa est connectée (beds24RoomId renseigné) — ne fait rien sinon, donc sans
// aucun effet tant qu'aucune vraie villa n'est migrée.
export async function pushReservationToBeds24(reservationId: string): Promise<void> {
  const db = getDb();

  const [row] = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      beds24BookingId: reservations.beds24BookingId,
      guestName: reservations.guestName,
      guestEmail: reservations.guestEmail,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      nbAdultes: reservations.nbAdultes,
      status: reservations.status,
      beds24RoomId: villas.beds24RoomId,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);

  if (!row || !row.beds24RoomId) return; // villa pas connectée à Beds24 : rien à faire

  const [firstName, ...rest] = row.guestName.split(" ");
  const write: Beds24BookingWrite = {
    id: row.beds24BookingId ? Number(row.beds24BookingId) : undefined,
    roomId: Number(row.beds24RoomId),
    status: row.status === "annulee" ? "cancelled" : "confirmed",
    arrival: format(row.checkIn, "yyyy-MM-dd"),
    departure: format(row.checkOut, "yyyy-MM-dd"),
    firstName,
    lastName: rest.join(" "),
    email: row.guestEmail || undefined,
    numAdult: row.nbAdultes ?? undefined,
  };

  const [result] = await beds24WriteBookings([write]);
  const newId = (result as { new?: { id: number } }).new?.id;
  if (newId && !row.beds24BookingId) {
    await db.update(reservations).set({ beds24BookingId: String(newId) }).where(eq(reservations.id, row.id));
  }
}
