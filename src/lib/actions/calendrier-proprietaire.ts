"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { conflitsSejour, indisponibilites, type Indisponibilites } from "@/lib/disponibilite";
import { fermerDatesBeds24, rouvrirDatesBeds24 } from "@/lib/beds24/fermeture";
import { journaliser, type Auteur, type Beds24Statut } from "@/lib/journal";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";
import { nowInMorocco } from "@/lib/now";
import { toTitleCase } from "@/lib/utils";
import { CANAL_SEJOUR_PROPRIETAIRE, villaDuCalendrierToken } from "@/lib/calendrier-partage";

// Séjours propriétaire depuis le lien public calendrier (/cal/[token]) — 2026-10-17 : le
// propriétaire de Villa Wimiliim peut réserver ses propres dates. Même effet qu'un blocage
// "Propriétaire" saisi par l'équipe dans "Nouvelle réservation" (actions/reservations.ts) :
// réservation à 0 €, sans ménage automatique, dates fermées sur Beds24 (donc Airbnb et
// Booking.com), journalisée, et l'équipe est prévenue sur WhatsApp. Pas de connexion Clerk : la
// portée est limitée au logement que le jeton désigne, revérifié à chaque appel.

type Resultat = { ok: true; message: string } | { ok: false; erreur: string };

const AUTEUR_PROPRIETAIRE: Auteur = { type: "humain", id: null, nom: "Propriétaire (lien calendrier)", email: null };
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const NUITS_MAX = 90;
const JOURS_MAX_A_L_AVANCE = 400;

function jourISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function decalerJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return jourISO(d);
}

function nuitsEntre(arrivee: string, depart: string): number {
  return Math.round((Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${arrivee}T00:00:00Z`)) / 86400000);
}

function jjmm(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;
}

// Aujourd'hui au Maroc (voir lib/now.ts : heure marocaine stockée telle quelle en UTC).
function aujourdhuiMaroc(): string {
  return jourISO(nowInMorocco());
}

function revaliderPages() {
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath("/journal");
}

// Nuits déjà prises du logement (réservations, Beds24 en direct, PriceLabs) pour griser le
// calendrier de choix des dates — revérifiées côté serveur au moment de réserver.
export async function indisponibilitesProprietaire(token: string): Promise<Indisponibilites | null> {
  const villa = await villaDuCalendrierToken(token);
  if (!villa) return null;
  const debut = aujourdhuiMaroc();
  return indisponibilites(villa.id, debut, decalerJours(debut, JOURS_MAX_A_L_AVANCE + NUITS_MAX));
}

export async function reserverDatesProprietaire(
  token: string,
  saisie: { arrivee: string; depart: string; nom: string; note: string }
): Promise<Resultat> {
  try {
    const villa = await villaDuCalendrierToken(token);
    if (!villa) return { ok: false, erreur: "Lien invalide : demandez un nouveau lien à l'agence." };

    const arrivee = String(saisie?.arrivee ?? "");
    const depart = String(saisie?.depart ?? "");
    if (!DATE_ISO.test(arrivee) || !DATE_ISO.test(depart)) {
      return { ok: false, erreur: "Choisissez une date d'arrivée et une date de départ." };
    }
    const nuits = nuitsEntre(arrivee, depart);
    if (!Number.isFinite(nuits) || nuits < 1) return { ok: false, erreur: "Le départ doit être après l'arrivée." };
    const aujourdhui = aujourdhuiMaroc();
    if (arrivee < aujourdhui) return { ok: false, erreur: "L'arrivée ne peut pas être dans le passé." };
    if (arrivee > decalerJours(aujourdhui, JOURS_MAX_A_L_AVANCE)) {
      return { ok: false, erreur: "Ces dates sont trop lointaines : contactez l'agence." };
    }
    if (nuits > NUITS_MAX) {
      return { ok: false, erreur: `${NUITS_MAX} nuits maximum par séjour : pour plus long, contactez l'agence.` };
    }

    // Même garde-fou que l'assistant de l'équipe : jamais sur des nuits déjà prises.
    const { conflits } = await conflitsSejour(villa.id, arrivee, depart);
    if (conflits.length > 0) {
      const liste = conflits.slice(0, 4).map((n) => `${n.slice(8, 10)}/${n.slice(5, 7)}`).join(", ");
      return {
        ok: false,
        erreur: `Ces dates ne sont plus disponibles (${liste}${conflits.length > 4 ? "…" : ""}). Choisissez d'autres dates.`,
      };
    }

    const nom = toTitleCase(String(saisie?.nom ?? "").trim().slice(0, 80)) || villa.proprietaireNom || "Propriétaire";
    const note = String(saisie?.note ?? "").trim().slice(0, 500);

    const db = getDb();
    // Heures par défaut de l'assistant de l'équipe (arrivée 15:00, départ 11:00), même convention
    // de stockage (heure marocaine telle quelle).
    const [reservation] = await db
      .insert(reservations)
      .values({
        villaId: villa.id,
        guestName: nom,
        checkIn: new Date(`${arrivee}T15:00:00Z`),
        checkOut: new Date(`${depart}T11:00:00Z`),
        notes: [`Réservé par le propriétaire depuis son lien calendrier.`, note].filter(Boolean).join(" "),
        source: "manuel",
        canal: CANAL_SEJOUR_PROPRIETAIRE,
        status: "confirmee",
      })
      .returning({ id: reservations.id });

    // Fermeture des dates sur Beds24 (donc Airbnb/Booking.com) : blocage de calendrier, comme
    // createReservation — "to" = dernière nuit incluse, pas le jour du départ.
    let beds24Statut: Beds24Statut = "non_concerne";
    let beds24Detail = "Logement non relié à Beds24 : dates non fermées sur Airbnb/Booking.com.";
    if (villa.beds24RoomId) {
      const resultat = await fermerDatesBeds24(Number(villa.beds24RoomId), arrivee, decalerJours(depart, -1));
      beds24Statut = resultat.statut;
      beds24Detail = resultat.detail;
      if (resultat.statut === "echec") console.error("Échec blocage calendrier Beds24 (séjour propriétaire):", resultat.detail);
    }

    await journaliser({
      action: "creation",
      auteur: AUTEUR_PROPRIETAIRE,
      reservationId: reservation.id,
      villaId: villa.id,
      villaNom: villa.nom,
      resume: `${nom} · ${CANAL_SEJOUR_PROPRIETAIRE} · du ${jjmm(arrivee)} au ${jjmm(depart)}`,
      beds24Statut,
      beds24Detail,
    });

    const fermetureOk = beds24Statut === "ok";
    await notifyStaffWhatsApp(
      [
        `Séjour propriétaire réservé depuis le lien calendrier : ${villa.nom}, du ${jjmm(arrivee)} au ${jjmm(depart)} (${nuits} nuit${nuits > 1 ? "s" : ""}), au nom de ${nom}.`,
        note ? `Note : ${note}` : null,
        fermetureOk ? null : `ATTENTION : dates non fermées sur Beds24 (${beds24Detail}) — à refermer depuis la fiche réservation.`,
      ]
        .filter(Boolean)
        .join("\n")
    ).catch(() => {});

    revaliderPages();
    return {
      ok: true,
      message: fermetureOk
        ? "Dates réservées : elles sont fermées sur Airbnb et Booking.com."
        : "Dates réservées. L'agence est prévenue et termine la fermeture sur Airbnb et Booking.com.",
    };
  } catch (err) {
    console.error("Échec réservation propriétaire:", err);
    return { ok: false, erreur: "La réservation n'a pas pu être enregistrée. Réessayez ou contactez l'agence." };
  }
}

// Annulation d'un séjour propriétaire pas encore commencé, sur le logement du jeton uniquement.
// Rouvre les dates sur Beds24 (même logique que deleteReservation pour un blocage créé dans l'app).
export async function annulerSejourProprietaire(token: string, reservationId: string): Promise<Resultat> {
  try {
    const villa = await villaDuCalendrierToken(token);
    if (!villa) return { ok: false, erreur: "Lien invalide : demandez un nouveau lien à l'agence." };

    const db = getDb();
    const [sejour] = await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        source: reservations.source,
        canal: reservations.canal,
        beds24BookingId: reservations.beds24BookingId,
      })
      .from(reservations)
      .where(and(eq(reservations.id, String(reservationId)), eq(reservations.villaId, villa.id)))
      .limit(1);

    if (!sejour || sejour.source !== "manuel" || sejour.canal !== CANAL_SEJOUR_PROPRIETAIRE || sejour.beds24BookingId) {
      return { ok: false, erreur: "Ce séjour ne peut pas être annulé depuis ce lien : contactez l'agence." };
    }
    const arrivee = jourISO(new Date(sejour.checkIn));
    const depart = jourISO(new Date(sejour.checkOut));
    if (arrivee <= aujourdhuiMaroc()) {
      return { ok: false, erreur: "Ce séjour a déjà commencé : contactez l'agence pour le modifier." };
    }

    await db.delete(reservations).where(eq(reservations.id, sejour.id));

    let beds24Statut: Beds24Statut = "non_concerne";
    let beds24Detail = "Logement non relié à Beds24 : rien à rouvrir.";
    if (villa.beds24RoomId && depart > arrivee) {
      const resultat = await rouvrirDatesBeds24(Number(villa.beds24RoomId), arrivee, decalerJours(depart, -1));
      beds24Statut = resultat.statut;
      beds24Detail = resultat.detail;
      if (resultat.statut === "echec") console.error("Échec réouverture Beds24 (séjour propriétaire annulé):", resultat.detail);
    }

    await journaliser({
      action: "suppression",
      auteur: AUTEUR_PROPRIETAIRE,
      reservationId: sejour.id,
      villaId: villa.id,
      villaNom: villa.nom,
      resume: `${sejour.guestName} · ${CANAL_SEJOUR_PROPRIETAIRE} · du ${jjmm(arrivee)} au ${jjmm(depart)}`,
      beds24Statut,
      beds24Detail,
    });

    await notifyStaffWhatsApp(
      [
        `Séjour propriétaire annulé depuis le lien calendrier : ${villa.nom}, du ${jjmm(arrivee)} au ${jjmm(depart)}.`,
        beds24Statut === "echec" ? `ATTENTION : dates pas rouvertes sur Beds24 (${beds24Detail}).` : null,
      ]
        .filter(Boolean)
        .join("\n")
    ).catch(() => {});

    revaliderPages();
    return { ok: true, message: "Séjour annulé : les dates sont de nouveau disponibles." };
  } catch (err) {
    console.error("Échec annulation séjour propriétaire:", err);
    return { ok: false, erreur: "L'annulation n'a pas pu être enregistrée. Réessayez ou contactez l'agence." };
  }
}
