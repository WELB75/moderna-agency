"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { conflitsSejour } from "@/lib/disponibilite";
import { fermerDatesBeds24 } from "@/lib/beds24/fermeture";
import { normaliseCanal } from "@/lib/canal";
import { auteurConnecte, journaliser, type Beds24Statut } from "@/lib/journal";
import { notifierKamelTelegram } from "@/lib/telegram";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";

// Prolongation d'un séjour — Kamel, 2026-10-28 : un client Airbnb/Booking qui prolonge sort du
// cadre de la plateforme, donc la suite est une réservation en direct, et "le principal c'est que
// ça bloque le calendrier" pour éviter la double réservation.
//
// Réservation de plateforme (Airbnb, Booking.com...) : on n'y touche jamais. La synchro Beds24
// remettrait de toute façon les dates de la plateforme, et modifier/annuler côté hôte peut
// déclencher le verrou anti-abus d'Airbnb (voir createReservation). On crée donc une réservation
// "Direct" séparée pour les nuits en plus, et on ferme ces nuits dans Beds24.
//
// Réservation déjà directe : on repousse simplement son départ, et on ferme les nuits ajoutées.

const jour = (d: Date) => d.toISOString().slice(0, 10);
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Beds24 : "to" est la DERNIÈRE NUIT incluse, pas le jour du départ (voir derniereNuit dans
// actions/reservations.ts).
function derniereNuit(debut: string, depart: string): string | null {
  const fin = format(subDays(new Date(`${depart}T12:00:00`), 1), "yyyy-MM-dd");
  return fin < debut ? null : fin;
}

export async function prolongerSejour(
  reservationId: string,
  nouveauDepart: string
): Promise<{ mode: "extension" | "direct"; beds24Statut: Beds24Statut; beds24Detail: string; menageAChecker: boolean }> {
  await auth.protect();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nouveauDepart)) throw new Error("Date de départ invalide.");

  const db = getDb();
  const [r] = await db
    .select({
      id: reservations.id,
      villaId: reservations.villaId,
      guestName: reservations.guestName,
      guestPhone: reservations.guestPhone,
      guestEmail: reservations.guestEmail,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      guestsCount: reservations.guestsCount,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      status: reservations.status,
      source: reservations.source,
      canal: reservations.canal,
      devisePaiement: reservations.devisePaiement,
      villaNom: villas.nom,
      villaNumero: villas.numero,
      beds24RoomId: villas.beds24RoomId,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r || !r.villaId) throw new Error("Réservation introuvable.");
  if (r.status === "annulee") throw new Error("Cette réservation est annulée.");

  // Les dates sont stockées en heure marocaine posée telle quelle en UTC (voir now.ts) : on lit
  // donc les composants UTC, jamais le fuseau du serveur.
  const ancienDepart = jour(r.checkOut);
  if (nouveauDepart <= ancienDepart) throw new Error("Le nouveau départ doit être après le départ actuel.");

  // Garde-fou : jamais de prolongation sur des nuits déjà prises (autre réservation de l'app,
  // calendrier Beds24 en direct, PriceLabs). Les nuits testées commencent au départ actuel, donc
  // la réservation elle-même n'est jamais comptée en conflit.
  const { conflits } = await conflitsSejour(r.villaId, ancienDepart, nouveauDepart);
  if (conflits.length > 0) {
    const liste = conflits.slice(0, 4).map(jjmm).join(", ");
    throw new Error(`Prolongation impossible : nuit(s) déjà prise(s) (${liste}${conflits.length > 4 ? "…" : ""}).`);
  }

  const nouveauCheckOut = new Date(r.checkOut);
  const [y, m, d] = nouveauDepart.split("-").map(Number);
  nouveauCheckOut.setUTCFullYear(y, m - 1, d); // garde l'heure de départ d'origine

  const canalKey = normaliseCanal(r.canal);
  const estPlateforme = canalKey === "airbnb" || canalKey === "booking" || r.source === "beds24" || r.source === "superhote";

  let mode: "extension" | "direct";
  let cibleId = r.id;
  if (estPlateforme) {
    mode = "extension";
    const [ext] = await db
      .insert(reservations)
      .values({
        villaId: r.villaId,
        guestName: r.guestName,
        guestPhone: r.guestPhone,
        guestEmail: r.guestEmail,
        checkIn: r.checkOut,
        checkOut: nouveauCheckOut,
        guestsCount: r.guestsCount,
        nbAdultes: r.nbAdultes,
        nbEnfants: r.nbEnfants,
        notes: `Prolongation en direct du séjour ${r.canal ?? "plateforme"} (départ initial le ${jjmm(ancienDepart)}).`,
        source: "manuel",
        canal: "Direct",
        status: "confirmee",
        devisePaiement: r.devisePaiement,
      })
      .returning({ id: reservations.id });
    cibleId = ext.id;
  } else {
    mode = "direct";
    await db.update(reservations).set({ checkOut: nouveauCheckOut, updatedAt: new Date() }).where(eq(reservations.id, r.id));
  }

  // Ferme les nuits ajoutées dans Beds24 (répercuté sur Airbnb/Booking.com) — blocage de
  // calendrier, jamais une réservation Beds24 (voir createReservation).
  let beds24Statut: Beds24Statut = "non_concerne";
  let beds24Detail: string;
  const derniere = derniereNuit(ancienDepart, nouveauDepart);
  if (!r.beds24RoomId) {
    beds24Detail = "Logement non relié à Beds24 : dates non fermées sur Airbnb/Booking.com.";
  } else if (!derniere) {
    beds24Detail = "Aucune nuit à fermer.";
  } else {
    const resultat = await fermerDatesBeds24(Number(r.beds24RoomId), ancienDepart, derniere);
    beds24Statut = resultat.statut;
    beds24Detail = resultat.detail;
    if (resultat.statut === "echec") console.error("Échec blocage calendrier Beds24 (prolongation):", resultat.detail);
  }

  // Ménage de fin de séjour : pour une prolongation directe il suit déjà la réservation (même
  // ligne, nouvelle date). Pour une extension séparée, on en sollicite un pour le nouveau départ ;
  // celui du départ initial (réservation plateforme) reste à retirer à la main.
  if (mode === "extension" && r.villaNom) {
    try {
      await initiateMenageRequest(cibleId, r.villaNom, r.villaNumero ?? null, nouveauDepart);
    } catch (err) {
      console.error("Échec initiation demande ménage (prolongation):", err);
    }
  }

  const resume = `${r.guestName} · départ ${jjmm(ancienDepart)} → ${jjmm(nouveauDepart)}${mode === "extension" ? " · prolongation en direct" : ""}`;
  await journaliser({
    action: "prolongation",
    libelle: mode === "extension" ? "Séjour prolongé en direct" : "Séjour prolongé",
    auteur: await auteurConnecte(),
    reservationId: cibleId,
    villaId: r.villaId,
    villaNom: r.villaNom,
    resume,
    beds24Statut,
    beds24Detail,
  });
  await notifierKamelTelegram(
    `Séjour prolongé : ${r.villaNom ?? "villa"} - ${resume}${beds24Statut === "echec" ? "\nAttention : le calendrier n'a PAS pu être bloqué sur Beds24." : ""}`
  );

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/reservations");
  revalidatePath("/calendrier");
  revalidatePath("/journal");

  return { mode, beds24Statut, beds24Detail, menageAChecker: mode === "extension" };
}
