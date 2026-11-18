import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { demandesServices } from "@/db/schema-services";
import { ServicesVoyageur } from "@/components/app/services-voyageur";

export const metadata: Metadata = {
  title: "Votre séjour — Superhosts",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Espace perso du voyageur (2026-11-18) : il choisit des services et activités, le jour, l'heure
// et le nombre de personnes ; l'équipe confirme ensuite. Aucun tarif, aucune donnée de paiement,
// aucun téléphone : seulement le séjour et ses propres demandes.
export default async function SejourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const db = getDb();

  const [resa] = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      status: reservations.status,
      nbAdultes: reservations.nbAdultes,
      nbEnfants: reservations.nbEnfants,
      villaNom: villas.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, id))
    .limit(1);
  if (!resa || resa.status === "annulee") notFound();

  const demandes = await db
    .select({
      id: demandesServices.id,
      serviceKey: demandesServices.serviceKey,
      jour: demandesServices.jour,
      heure: demandesServices.heure,
      nbPersonnes: demandesServices.nbPersonnes,
      statut: demandesServices.statut,
    })
    .from(demandesServices)
    .where(eq(demandesServices.reservationId, id))
    .orderBy(asc(demandesServices.jour), asc(demandesServices.heure));

  const personnes = (resa.nbAdultes ?? 0) + (resa.nbEnfants ?? 0);

  return (
    <ServicesVoyageur
      reservationId={resa.id}
      prenom={resa.guestName.trim().split(/\s+/)[0] ?? ""}
      villaNom={resa.villaNom ?? ""}
      arrivee={new Date(resa.checkIn).toISOString().slice(0, 10)}
      depart={new Date(resa.checkOut).toISOString().slice(0, 10)}
      personnesParDefaut={personnes > 0 ? personnes : 2}
      demandes={demandes}
    />
  );
}
