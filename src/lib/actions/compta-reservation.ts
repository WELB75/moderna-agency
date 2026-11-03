"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { assurerTableLignes } from "@/lib/compta-reservation";
import { CATEGORIES_LIGNES, arrondir, lireNombre, totalFacture, type CategorieLigne } from "@/lib/compta-reservation-format";
import { tracer } from "@/lib/journal";

export type LigneSaisie = { categorie: string; libelle: string; quantite: string | number; prixUnitaire: string | number };

const CATEGORIES_VALIDES = new Set<string>(CATEGORIES_LIGNES.map((c) => c.id));

// Remplace toutes les lignes facturées de la réservation (le formulaire envoie la liste
// complète). Une ligne vide (ni libellé ni montant) est ignorée. `aligner` met aussi le loyer de
// la réservation au total des lignes, pour que la fiche, le tableau de bord et les statistiques
// parlent du même chiffre.
export async function enregistrerLignesReservation(reservationId: string, lignes: LigneSaisie[], aligner: boolean) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");
  if (lignes.length > 40) throw new Error("Trop de lignes (40 maximum).");

  const propres = lignes
    .map((l) => ({
      categorie: (CATEGORIES_VALIDES.has(l.categorie) ? l.categorie : "autre") as CategorieLigne,
      libelle: String(l.libelle ?? "").trim().slice(0, 140),
      quantite: arrondir(Math.max(0, lireNombre(l.quantite))),
      prixUnitaire: arrondir(lireNombre(l.prixUnitaire)),
    }))
    .filter((l) => l.libelle !== "" || l.prixUnitaire !== 0);

  for (const l of propres) {
    if (l.quantite === 0) throw new Error(`La quantité de « ${l.libelle || "ligne"} » doit être supérieure à 0.`);
    if (Math.abs(l.quantite * l.prixUnitaire) > 1_000_000) throw new Error("Montant trop élevé.");
  }

  await assurerTableLignes();
  const db = getDb();
  await db.execute(sql`DELETE FROM reservation_lignes WHERE reservation_id = ${reservationId}`);
  let ordre = 0;
  for (const l of propres) {
    const libelle = l.libelle || CATEGORIES_LIGNES.find((c) => c.id === l.categorie)?.label || "Ligne";
    await db.execute(sql`
      INSERT INTO reservation_lignes (reservation_id, categorie, libelle, quantite, prix_unitaire, ordre)
      VALUES (${reservationId}, ${l.categorie}, ${libelle}, ${l.quantite}, ${l.prixUnitaire}, ${ordre++})
    `);
  }

  const total = totalFacture(propres);
  if (aligner && propres.length > 0) {
    await db.update(reservations).set({ loyerTotal: total.toFixed(2), updatedAt: new Date() }).where(eq(reservations.id, reservationId));
  }

  await tracer({
    categorie: "reservation",
    action: "detail_financier_modifie",
    libelle: "Détail financier de la réservation modifié",
    resume: `${propres.length} ligne(s), total ${total.toFixed(2)}${aligner ? " · loyer aligné" : ""}`,
    reservationId,
  });

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/caisse/rapport/reservations");
}

// Note de règlement (virement, acompte, reste en espèces à l'arrivée...) : champ qui existait mais
// n'était modifiable que depuis le formulaire de paiement.
export async function enregistrerNotePaiement(reservationId: string, note: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");
  await getDb()
    .update(reservations)
    .set({ notesPaiement: note.trim().slice(0, 2000) || null, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/caisse/rapport/reservations");
}
