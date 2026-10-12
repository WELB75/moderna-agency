"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { runBeds24Sync } from "@/lib/beds24/sync";
import { beds24SendMessage } from "@/lib/beds24/client";
import { BEDS24_VILLA_MAPPING, villaNameMatchesMapping } from "@/lib/beds24/mapping";

// Déclenchement manuel depuis le tableau de bord (bouton dans "Options"), même principe que
// triggerIcalSync — utile tant qu'aucun cron n'est en place, notamment pour valider la connexion
// Beds24 sur la propriété test avant de migrer une vraie villa.
export async function triggerBeds24Sync() {
  await auth.protect();
  const result = await runBeds24Sync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return result.success
    ? {
        success: true,
        message:
          `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s) connectée(s) à Beds24)` +
          (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
          (result.bookingsAdopted > 0 ? ` · ${result.bookingsAdopted} rattachée(s) à une résa SuperHote existante` : "") +
          ".",
      }
    : { success: false, message: result.error };
}

// Répondre à un voyageur Airbnb/Booking.com depuis la boîte de réception — Kamel, 2026-09-15 :
// "je veux pouvoir aussi y répondre sur l'app". Le bookingId n'est jamais pris tel quel côté
// client : on le retrouve ici à partir du reservationId pour n'envoyer que sur une résa qui
// appartient bien à cette réservation (même logique que les autres actions par id plutôt que par
// valeur brute fournie par le client).
export async function sendBeds24Message(reservationId: string, message: string) {
  await auth.protect();
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Le message ne peut pas être vide.");

  const db = getDb();
  const [reservation] = await db
    .select({ beds24BookingId: reservations.beds24BookingId })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!reservation?.beds24BookingId) throw new Error("Cette réservation n'est pas liée à un canal Beds24.");

  await beds24SendMessage(Number(reservation.beds24BookingId), trimmed);
  revalidatePath("/chat");
}

export type LinkVillasToBeds24Report = {
  success: boolean;
  message: string;
  linked: { villa: string; beds24: string; roomId: number }[];
  alreadyLinked: { villa: string; beds24: string }[];
  ambiguous: { beds24: string; villas: string[]; reason: string }[];
  notFound: string[];
  skipped: string[];
};

// Bascule SuperHote -> Beds24 (2026-10-13) : renseigne beds24PropertyId/beds24RoomId sur chaque
// villa à partir de la table BEDS24_VILLA_MAPPING. Prudent par construction : une villa n'est
// liée que si elle est la SEULE à correspondre au mot-clé, et qu'elle ne correspond elle-même
// qu'à une seule entrée de la table ; tout le reste est remonté dans le rapport sans rien écrire.
// Ré-exécutable sans risque (les villas déjà liées aux bons identifiants sont simplement listées).
export async function linkVillasToBeds24(): Promise<LinkVillasToBeds24Report> {
  await auth.protect();
  const db = getDb();

  const rows = await db
    .select({ id: villas.id, nom: villas.nom, beds24PropertyId: villas.beds24PropertyId, beds24RoomId: villas.beds24RoomId })
    .from(villas);

  const report: LinkVillasToBeds24Report = {
    success: true,
    message: "",
    linked: [],
    alreadyLinked: [],
    ambiguous: [],
    notFound: [],
    skipped: [],
  };

  // Nombre d'entrées de la table auxquelles chaque villa correspond (hors entrées "skip") : une
  // villa qui en attrape plusieurs ("Lina & Mila") n'est liée à aucune.
  const activeMappings = BEDS24_VILLA_MAPPING.filter((m) => !m.skip);
  const matchCountByVilla = new Map<string, number>();
  for (const villa of rows) {
    matchCountByVilla.set(villa.id, activeMappings.filter((m) => villaNameMatchesMapping(villa.nom, m)).length);
  }

  for (const mapping of BEDS24_VILLA_MAPPING) {
    if (mapping.skip) {
      report.skipped.push(mapping.label);
      continue;
    }

    const matches = rows.filter((v) => villaNameMatchesMapping(v.nom, mapping));
    if (matches.length === 0) {
      report.notFound.push(mapping.label);
      continue;
    }
    if (matches.length > 1) {
      report.ambiguous.push({ beds24: mapping.label, villas: matches.map((v) => v.nom), reason: "plusieurs villas correspondent" });
      continue;
    }

    const villa = matches[0];
    if ((matchCountByVilla.get(villa.id) ?? 0) > 1) {
      report.ambiguous.push({ beds24: mapping.label, villas: [villa.nom], reason: "le nom correspond à plusieurs villas Beds24" });
      continue;
    }

    const roomId = String(mapping.roomId);
    const propertyId = String(mapping.propertyId);

    // Chambre déjà rattachée à une AUTRE villa (liaison manuelle antérieure) : on ne touche à
    // rien plutôt que de créer deux villas synchronisées sur le même calendrier.
    const otherOwner = rows.find((v) => v.id !== villa.id && v.beds24RoomId === roomId);
    if (otherOwner) {
      report.ambiguous.push({ beds24: mapping.label, villas: [villa.nom, otherOwner.nom], reason: `chambre déjà liée à ${otherOwner.nom}` });
      continue;
    }

    if (villa.beds24RoomId === roomId && villa.beds24PropertyId === propertyId) {
      report.alreadyLinked.push({ villa: villa.nom, beds24: mapping.label });
      continue;
    }

    await db
      .update(villas)
      .set({ beds24PropertyId: propertyId, beds24RoomId: roomId, updatedAt: new Date() })
      .where(eq(villas.id, villa.id));
    villa.beds24PropertyId = propertyId;
    villa.beds24RoomId = roomId;
    report.linked.push({ villa: villa.nom, beds24: mapping.label, roomId: mapping.roomId });
  }

  const parts = [`${report.linked.length} villa(s) liée(s)`];
  if (report.alreadyLinked.length > 0) parts.push(`${report.alreadyLinked.length} déjà liée(s)`);
  if (report.ambiguous.length > 0) {
    parts.push(`ambiguës : ${report.ambiguous.map((a) => `${a.beds24} (${a.reason} : ${a.villas.join(", ")})`).join(" ; ")}`);
  }
  if (report.notFound.length > 0) parts.push(`introuvables : ${report.notFound.join(", ")}`);
  if (report.skipped.length > 0) parts.push(`non liées volontairement : ${report.skipped.join(", ")}`);
  report.message = parts.join(" · ") + ".";

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  return report;
}
