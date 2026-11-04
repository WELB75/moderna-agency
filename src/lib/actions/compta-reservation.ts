"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { assurerTableLignes, chargerContexteOptions, lignesDeLaReservation } from "@/lib/compta-reservation";
import {
  CATEGORIES_LIGNES,
  OPTIONS_RAPIDES,
  arrondir,
  basculerOption,
  changerQuantite,
  lireNombre,
  totalFacture,
  type CategorieLigne,
  type LigneFacture,
  type TarifsOptions,
} from "@/lib/compta-reservation-format";
import { tracer } from "@/lib/journal";
import { DEVISES_RESERVATION } from "@/lib/devises";

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

// ---- Cases à cocher du tableau de bord ----

async function remplacerLignes(reservationId: string, lignes: { categorie: CategorieLigne; libelle: string; quantite: number; prixUnitaire: number }[]) {
  await assurerTableLignes();
  const db = getDb();
  await db.execute(sql`DELETE FROM reservation_lignes WHERE reservation_id = ${reservationId}`);
  let ordre = 0;
  for (const l of lignes) {
    await db.execute(sql`
      INSERT INTO reservation_lignes (reservation_id, categorie, libelle, quantite, prix_unitaire, ordre)
      VALUES (${reservationId}, ${l.categorie}, ${l.libelle}, ${l.quantite}, ${l.prixUnitaire}, ${ordre++})
    `);
  }
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/caisse/rapport/reservations");
}

// État renvoyé au tableau de bord après chaque clic : la carte se met à jour sur place, sans
// recharger la page (qui refermerait la carte dépliée).
export type EtatOptions = { lignes: LigneFacture[]; devise: string; tarifs: TarifsOptions; loyerTotal: number | null; montantPaye: number | null; fraisMenage: number | null };

async function etatOptions(reservationId: string): Promise<EtatOptions> {
  const [lignes, contexte] = await Promise.all([lignesDeLaReservation(reservationId), chargerContexteOptions(reservationId)]);
  if (!contexte) throw new Error("Réservation introuvable.");
  return { lignes, devise: contexte.devise, tarifs: contexte.tarifs, loyerTotal: contexte.loyerTotal, montantPaye: contexte.montantPaye, fraisMenage: contexte.fraisMenage };
}

// Coche ou décoche une option facturée (cuisinière, piscine chauffée, ménage...) d'un seul clic.
export async function basculerOptionFacturee(reservationId: string, categorie: string): Promise<EtatOptions> {
  await auth.protect();
  if (!OPTIONS_RAPIDES.some((o) => o.categorie === categorie)) throw new Error("Option inconnue.");
  const [contexte, actuelles] = await Promise.all([chargerContexteOptions(reservationId), lignesDeLaReservation(reservationId)]);
  if (!contexte) throw new Error("Réservation introuvable.");
  const apres = basculerOption(actuelles, categorie as CategorieLigne, contexte);
  if (apres === actuelles) throw new Error("Cette option n'est pas proposée pour ce logement.");
  await remplacerLignes(reservationId, apres);
  const coche = apres.some((l) => l.categorie === categorie);
  await tracer({
    categorie: "reservation",
    action: "option_facturee",
    libelle: `${coche ? "Option ajoutée" : "Option retirée"} : ${OPTIONS_RAPIDES.find((o) => o.categorie === categorie)?.label}`,
    resume: `total facturé ${totalFacture(apres).toFixed(2)}`,
    reservationId,
  });
  return etatOptions(reservationId);
}

// Ajuste le nombre de jours (ou de fois) d'une option déjà cochée.
export async function changerQuantiteOption(reservationId: string, categorie: string, delta: number): Promise<EtatOptions> {
  await auth.protect();
  if (!Number.isFinite(delta) || Math.abs(delta) > 30) throw new Error("Valeur invalide.");
  const actuelles = await lignesDeLaReservation(reservationId);
  await remplacerLignes(reservationId, changerQuantite(actuelles, categorie as CategorieLigne, delta));
  return etatOptions(reservationId);
}

// Change la devise de la réservation (euros, dirhams, dollars, livres). Les montants déjà saisis ne
// sont pas convertis : seule la devise change, comme dans le formulaire Paiement ; les tarifs des
// options cochées ensuite sont, eux, proposés dans la nouvelle devise.
export async function changerDeviseReservation(reservationId: string, devise: string): Promise<EtatOptions> {
  await auth.protect();
  const code = DEVISES_RESERVATION.find((d) => d.code === devise)?.code;
  if (!code) throw new Error("Devise inconnue.");
  await getDb().update(reservations).set({ devisePaiement: code, updatedAt: new Date() }).where(eq(reservations.id, reservationId));
  await tracer({
    categorie: "paiement",
    action: "devise_modifiee",
    libelle: `Devise de la réservation : ${code}`,
    resume: code,
    reservationId,
  });
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/caisse/rapport/reservations");
  return etatOptions(reservationId);
}
