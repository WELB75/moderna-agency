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
  ajouterLigneLibre,
  changerQuantite,
  modifierLigneIndex,
  retirerLigneIndex,
  lireNombre,
  modifierLigne,
  totalFacture,
  type ModificationLigne,
  FORMULES_CUISINE,
  libelleCuisine,
  prixFormuleCuisine,
  type FormuleCuisine,
  type CategorieLigne,
  type LigneFacture,
  type TarifsOptions,
} from "@/lib/compta-reservation-format";
import { tracer } from "@/lib/journal";
import { DEVISES_RESERVATION, codeDevise, convertirMontant } from "@/lib/devises";

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
  // Pas de revalidatePath ici : il recharge la page en cours (le tableau de bord) et referme la
  // fenêtre de note à chaque clic. L'appelant l'appelle une fois à la fermeture (rafraichirApresOptions).
}

// À appeler une fois, à la fermeture de la fenêtre de note, après des changements d'options.
export async function rafraichirApresOptions(reservationId: string) {
  await auth.protect();
  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/dashboard");
  revalidatePath("/caisse/rapport/reservations");
  revalidatePath("/comptabilite");
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

// Lecture de l'état des options à l'ouverture de la fenêtre de note (client, après coup).
export async function lireEtatOptions(reservationId: string): Promise<EtatOptions> {
  await auth.protect();
  return etatOptions(reservationId);
}

// Modifie le nombre de jours, le prix ou la formule d'une option déjà cochée. Choisir une formule de
// cuisinière applique son tarif par jour (dans la devise de la réservation).
export async function modifierOptionFacturee(reservationId: string, categorie: string, patch: ModificationLigne & { formule?: FormuleCuisine }): Promise<EtatOptions> {
  await auth.protect();
  if (!OPTIONS_RAPIDES.some((o) => o.categorie === categorie)) throw new Error("Option inconnue.");
  if (patch.quantite !== undefined && (!Number.isFinite(patch.quantite) || patch.quantite < 1 || patch.quantite > 90)) throw new Error("Nombre de jours invalide.");
  if (patch.prixUnitaire !== undefined && (!Number.isFinite(patch.prixUnitaire) || patch.prixUnitaire < 0 || patch.prixUnitaire > 100_000)) throw new Error("Prix invalide.");
  const actuelles = await lignesDeLaReservation(reservationId);
  if (!actuelles.some((l) => l.categorie === categorie)) throw new Error("Cochez d'abord l'option.");
  let modification: ModificationLigne = { quantite: patch.quantite, prixUnitaire: patch.prixUnitaire, libelle: patch.libelle };
  if (patch.formule) {
    if (categorie !== "cuisine" || !FORMULES_CUISINE.includes(patch.formule)) throw new Error("Formule inconnue.");
    const contexte = await chargerContexteOptions(reservationId);
    if (!contexte) throw new Error("Réservation introuvable.");
    const prix = prixFormuleCuisine(contexte.tarifs, patch.formule);
    if (prix === null) throw new Error("La cuisinière n'est pas facturée pour ce logement.");
    modification = { ...modification, libelle: libelleCuisine(patch.formule), prixUnitaire: prix };
  }
  const apres = modifierLigne(actuelles, categorie as CategorieLigne, modification);
  await remplacerLignes(reservationId, apres);
  await tracer({
    categorie: "reservation",
    action: "option_facturee",
    libelle: `Option modifiée : ${OPTIONS_RAPIDES.find((o) => o.categorie === categorie)?.label}`,
    resume: `total facturé ${totalFacture(apres).toFixed(2)}`,
    reservationId,
  });
  return etatOptions(reservationId);
}

// Change la devise de la réservation (euros, dirhams, dollars, livres) ET convertit tous les montants
// déjà saisis (loyer, encaissé, caution, frais de ménage, lignes facturées) : 80 € deviennent 800 MAD
// (taux fixe de 10 pour le dirham). Sans cela, 80 restait 80 avec une autre étiquette.
export async function changerDeviseReservation(reservationId: string, devise: string): Promise<EtatOptions> {
  await auth.protect();
  const code = DEVISES_RESERVATION.find((d) => d.code === devise)?.code;
  if (!code) throw new Error("Devise inconnue.");
  const db = getDb();
  const [r] = await db
    .select({ devise: reservations.devisePaiement, loyerTotal: reservations.loyerTotal, montantPaye: reservations.montantPaye, caution: reservations.caution, fraisMenage: reservations.fraisMenage })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) throw new Error("Réservation introuvable.");
  const ancienne = r.devise || "EUR";
  if (codeDevise(ancienne) !== code) {
    const conv = async (v: string | null) => (v == null ? null : (await convertirMontant(Number(v), ancienne, code)).toFixed(2));
    const [loyerTotal, montantPaye, caution, fraisMenage] = await Promise.all([conv(r.loyerTotal), conv(r.montantPaye), conv(r.caution), conv(r.fraisMenage)]);
    const actuelles = await lignesDeLaReservation(reservationId);
    const converties = await Promise.all(actuelles.map(async (l) => ({ ...l, prixUnitaire: await convertirMontant(l.prixUnitaire, ancienne, code) })));
    await db.update(reservations).set({ devisePaiement: code, loyerTotal, montantPaye, caution, fraisMenage, updatedAt: new Date() }).where(eq(reservations.id, reservationId));
    if (actuelles.length > 0) await remplacerLignes(reservationId, converties);
  }
  await tracer({
    categorie: "paiement",
    action: "devise_modifiee",
    libelle: `Devise de la réservation : ${code}`,
    resume: `${ancienne} vers ${code}, montants convertis`,
    reservationId,
  });
  return etatOptions(reservationId);
}

// ---- Options libres (écrites à la main) ----

export async function ajouterOptionLibre(reservationId: string, saisie: { libelle: string; quantite: number; prixUnitaire: number }): Promise<EtatOptions> {
  await auth.protect();
  if (saisie.quantite > 365 || saisie.prixUnitaire > 100_000) throw new Error("Valeur trop élevée.");
  const [contexte, actuelles] = await Promise.all([chargerContexteOptions(reservationId), lignesDeLaReservation(reservationId)]);
  if (!contexte) throw new Error("Réservation introuvable.");
  if (actuelles.length >= 40) throw new Error("Trop de lignes (40 maximum).");
  const apres = ajouterLigneLibre(actuelles, saisie, contexte);
  if (!apres) throw new Error("Écrivez le nom de l'option et un prix.");
  await remplacerLignes(reservationId, apres);
  await tracer({
    categorie: "reservation",
    action: "option_facturee",
    libelle: `Option ajoutée : ${saisie.libelle.trim().slice(0, 60)}`,
    resume: `total facturé ${totalFacture(apres).toFixed(2)}`,
    reservationId,
  });
  return etatOptions(reservationId);
}

export async function retirerOptionLibre(reservationId: string, index: number): Promise<EtatOptions> {
  await auth.protect();
  const actuelles = await lignesDeLaReservation(reservationId);
  if (!actuelles[index] || actuelles[index].categorie !== "autre") throw new Error("Option introuvable.");
  await remplacerLignes(reservationId, retirerLigneIndex(actuelles, index));
  return etatOptions(reservationId);
}

export async function modifierOptionLibre(reservationId: string, index: number, patch: ModificationLigne): Promise<EtatOptions> {
  await auth.protect();
  if (patch.quantite !== undefined && (!Number.isFinite(patch.quantite) || patch.quantite < 1 || patch.quantite > 365)) throw new Error("Nombre invalide.");
  if (patch.prixUnitaire !== undefined && (!Number.isFinite(patch.prixUnitaire) || patch.prixUnitaire < 0 || patch.prixUnitaire > 100_000)) throw new Error("Prix invalide.");
  const actuelles = await lignesDeLaReservation(reservationId);
  if (!actuelles[index] || actuelles[index].categorie !== "autre") throw new Error("Option introuvable.");
  await remplacerLignes(reservationId, modifierLigneIndex(actuelles, index, patch));
  return etatOptions(reservationId);
}
