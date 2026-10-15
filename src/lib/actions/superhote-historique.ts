"use server";

// Import de l'historique complet Superhote (toutes les réservations depuis 2023, prix, paiements,
// cautions, fiches voyageurs) — Fouad, 2026-10-15. Deux temps : analyserHistoriqueSuperhote
// (aperçu, n'écrit rien) puis importerHistoriqueSuperhote. Les règles de rapprochement sont dans
// planifierImportSuperhote (lib/superhote-historique.ts).
// Les réservations créées le sont SANS aucun effet de bord (pas de demande de ménage, pas de
// WhatsApp, pas d'écriture Beds24) : c'est de l'historique.
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, ignoredBookings, reservations, villas } from "@/db/schema";
import { parseSuperhoteCsv } from "@/lib/superhote-csv";
import {
  normaliserLignes,
  planifierImportSuperhote,
  type BilanImportSuperhote,
  type OptionsImportSuperhote,
  type PlanImportSuperhote,
} from "@/lib/superhote-historique";

async function preparerPlan(csvText: string, options: OptionsImportSuperhote): Promise<PlanImportSuperhote> {
  const rows = parseSuperhoteCsv(csvText);
  if (rows.length === 0) throw new Error("Fichier vide ou illisible.");
  const { format, lignes, illisibles } = normaliserLignes(rows);
  if (!format) {
    throw new Error("Format non reconnu : utilise l'export historique Superhote ou l'export CSV « Exporter les réservations ».");
  }

  const db = getDb();
  const [villasApp, reservationsApp, clientsApp, ignores] = await Promise.all([
    db.select({ id: villas.id, nom: villas.nom, superhoteListingId: villas.superhoteListingId }).from(villas),
    db
      .select({
        id: reservations.id,
        villaId: reservations.villaId,
        superhoteBookingId: reservations.superhoteBookingId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        source: reservations.source,
        loyerTotal: reservations.loyerTotal,
        montantPaye: reservations.montantPaye,
        caution: reservations.caution,
        cautionPayee: reservations.cautionPayee,
        fraisMenage: reservations.fraisMenage,
        devisePaiement: reservations.devisePaiement,
        canal: reservations.canal,
        guestPhone: reservations.guestPhone,
        guestEmail: reservations.guestEmail,
        nbAdultes: reservations.nbAdultes,
        nbEnfants: reservations.nbEnfants,
        guestsCount: reservations.guestsCount,
        rawData: reservations.rawData,
      })
      .from(reservations),
    db.select({ telephone: clients.telephone, email: clients.email }).from(clients),
    db.select({ id: ignoredBookings.superhoteBookingId }).from(ignoredBookings),
  ]);

  return planifierImportSuperhote(
    { format, lignes, totalLignes: rows.length, illisibles },
    { villas: villasApp, reservations: reservationsApp, clients: clientsApp, idsIgnores: ignores.map((i) => i.id) },
    options,
    new Date().toISOString()
  );
}

export async function analyserHistoriqueSuperhote(csvText: string, options: OptionsImportSuperhote = {}): Promise<BilanImportSuperhote> {
  await auth.protect();
  const { bilan } = await preparerPlan(csvText, options);
  return bilan;
}

async function parLots<T>(items: T[], taille: number, traiter: (lot: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += taille) {
    await traiter(items.slice(i, i + taille));
  }
}

export async function importerHistoriqueSuperhote(csvText: string, options: OptionsImportSuperhote = {}): Promise<BilanImportSuperhote> {
  await auth.protect();
  const { bilan, insertions, misesAJour, nouveauxClients } = await preparerPlan(csvText, options);
  const db = getDb();

  let crees = 0;
  await parLots(insertions, 100, async (lot) => {
    // onConflictDoNothing : filet de sécurité sur les index uniques (identifiant Superhote).
    const res = await db.insert(reservations).values(lot).onConflictDoNothing().returning({ id: reservations.id });
    crees += res.length;
  });

  let completees = 0;
  await parLots(misesAJour, 10, async (lot) => {
    await Promise.all(lot.map((m) => db.update(reservations).set(m.valeurs).where(eq(reservations.id, m.id))));
    completees += lot.length;
  });

  let clientsCrees = 0;
  await parLots(nouveauxClients, 100, async (lot) => {
    const res = await db.insert(clients).values(lot).returning({ id: clients.id });
    clientsCrees += res.length;
  });

  revalidatePath("/statistiques");
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");

  return { ...bilan, crees, completees, clientsCrees };
}
