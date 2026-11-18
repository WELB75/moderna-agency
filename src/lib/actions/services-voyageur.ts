"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { demandesServices } from "@/db/schema-services";
import { CRENEAUX, HEURE_FLEXIBLE, SERVICE_PAR_CLE } from "@/lib/services-catalogue";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";

// Demandes de services du voyageur depuis son lien public /sejour/[id] — volontairement sans
// connexion : la réservation désignée par l'adresse (UUID aléatoire) borne la portée, et tout est
// revalidé ici côté serveur (clés du catalogue, dates dans le séjour, créneaux, nombre de
// personnes), jamais fait confiance au navigateur.
export type DemandeEntree = { serviceKey: string; jour: string; heure: string; nbPersonnes: number; note?: string };
type Resultat = { ok: true; nb: number } | { ok: false; erreur: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEMANDES_PAR_RESERVATION = 40;

export async function envoyerDemandesServices(reservationId: string, demandes: DemandeEntree[]): Promise<Resultat> {
  if (!UUID_RE.test(reservationId)) return { ok: false, erreur: "Lien invalide." };
  if (!Array.isArray(demandes) || demandes.length === 0) return { ok: false, erreur: "Aucun service sélectionné." };
  if (demandes.length > 15) return { ok: false, erreur: "Trop de services à la fois." };

  const db = getDb();
  const [resa] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      status: reservations.status,
      villaNom: villas.nom,
      villaNumero: villas.numero,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!resa || resa.status === "annulee") return { ok: false, erreur: "Réservation introuvable." };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(demandesServices)
    .where(eq(demandesServices.reservationId, reservationId));
  if (n + demandes.length > MAX_DEMANDES_PAR_RESERVATION) return { ok: false, erreur: "Trop de demandes sur ce séjour, contactez-nous." };

  const debut = new Date(resa.checkIn).toISOString().slice(0, 10);
  const fin = new Date(resa.checkOut).toISOString().slice(0, 10);

  const lignes: (typeof demandesServices.$inferInsert)[] = [];
  for (const d of demandes) {
    const service = SERVICE_PAR_CLE.get(d.serviceKey);
    if (!service) return { ok: false, erreur: "Service inconnu." };
    if (!JOUR_RE.test(d.jour) || d.jour < debut || d.jour > fin) return { ok: false, erreur: `Choisissez un jour pendant votre séjour (${service.fr}).` };
    if (d.heure !== HEURE_FLEXIBLE && !CRENEAUX.includes(d.heure)) return { ok: false, erreur: `Heure invalide (${service.fr}).` };
    const nb = Math.trunc(Number(d.nbPersonnes));
    if (!Number.isFinite(nb) || nb < 1 || nb > 30) return { ok: false, erreur: `Nombre de personnes invalide (${service.fr}).` };
    lignes.push({
      reservationId,
      serviceKey: service.key,
      serviceLabel: service.fr,
      jour: d.jour,
      heure: d.heure,
      nbPersonnes: nb,
      note: d.note?.trim().slice(0, 300) || null,
    });
  }

  await db.insert(demandesServices).values(lignes);

  try {
    const resume = lignes
      .map((l) => `${l.serviceLabel} le ${l.jour.slice(8, 10)}/${l.jour.slice(5, 7)} à ${l.heure === HEURE_FLEXIBLE ? "heure flexible" : l.heure} (${l.nbPersonnes} pers.)`)
      .join(" ; ");
    await notifyStaffWhatsApp(
      `Demande de services — ${resa.guestName}${resa.villaNom ? `, ${resa.villaNom}${resa.villaNumero ? ` (n°${resa.villaNumero})` : ""}` : ""} : ${resume}.`
    );
  } catch (err) {
    console.error("Notification demande de services:", err);
  }

  revalidatePath(`/sejour/${reservationId}`);
  revalidatePath("/demandes");
  return { ok: true, nb: lignes.length };
}

// Côté équipe (connectée) : confirmer, refuser ou clôturer une demande.
export async function changerStatutDemandeService(demandeId: string, statut: "demandee" | "confirmee" | "refusee" | "terminee") {
  await auth.protect();
  if (!["demandee", "confirmee", "refusee", "terminee"].includes(statut)) throw new Error("Statut invalide.");
  const db = getDb();
  const [row] = await db
    .update(demandesServices)
    .set({ statut, updatedAt: new Date() })
    .where(and(eq(demandesServices.id, demandeId), ne(demandesServices.statut, statut)))
    .returning({ reservationId: demandesServices.reservationId });
  if (row) revalidatePath(`/sejour/${row.reservationId}`);
  revalidatePath("/demandes");
}
