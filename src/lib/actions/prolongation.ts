"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { conflitsSejour } from "@/lib/disponibilite";
import { fermerDatesBeds24, rouvrirDatesBeds24 } from "@/lib/beds24/fermeture";
import { normaliseCanal } from "@/lib/canal";
import { auteurConnecte, journaliser, type Beds24Statut } from "@/lib/journal";
import { notifierKamelTelegram } from "@/lib/telegram";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";
import { deleteReservation } from "@/lib/actions/reservations";

// Prolongation d'un séjour — Kamel, 2026-10-28 : un client Airbnb/Booking qui prolonge sort du
// cadre de la plateforme, donc la suite est une réservation en direct, et "le principal c'est que
// ça bloque le calendrier" pour éviter la double réservation. Puis : jour de départ, prix de la
// nuitée... configurables, et "revenir en arrière si on valide par erreur".
//
// Réservation de plateforme (Airbnb, Booking.com...) : on n'y touche jamais. La synchro Beds24
// remettrait de toute façon les dates de la plateforme, et modifier/annuler côté hôte peut
// déclencher le verrou anti-abus d'Airbnb (voir createReservation). On crée donc une réservation
// "Direct" séparée pour les nuits en plus (rawData.prolongationDe renvoie à l'originale), et on
// ferme ces nuits dans Beds24. Annuler = supprimer cette réservation (deleteReservation rouvre les
// nuits et retire le ménage affecté).
//
// Réservation déjà directe : on repousse simplement son départ (historique dans
// rawData.prolongations), on ferme les nuits ajoutées ; annuler remet l'ancien départ, le prix
// d'avant et rouvre les nuits.

const jour = (d: Date) => d.toISOString().slice(0, 10);
const jjmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

// Beds24 : "to" est la DERNIÈRE NUIT incluse, pas le jour du départ (voir derniereNuit dans
// actions/reservations.ts).
function derniereNuit(debut: string, depart: string): string | null {
  const fin = format(subDays(new Date(`${depart}T12:00:00`), 1), "yyyy-MM-dd");
  return fin < debut ? null : fin;
}

function nbNuits(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

function montant(valeur: unknown): number | null {
  const n = typeof valeur === "string" ? Number(valeur.replace(",", ".")) : Number(valeur);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

type EntreeDirecte = {
  id: string;
  ancienCheckOut: string; // ISO complet, pour tout remettre à l'identique
  ancienDepart: string; // YYYY-MM-DD
  nouveauDepart: string;
  loyerAjoute: number | null;
  montantAjoute: number | null;
  noteAjoutee: string | null;
  ferme: boolean; // des nuits ont été fermées dans Beds24 (donc à rouvrir)
  at: string;
};

export type ProlongationListee = {
  id: string;
  mode: "extension" | "direct";
  ancienDepart: string;
  nouveauDepart: string;
  total: number | null;
  devise: string;
  at: string;
};

const SELECTION = {
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
  loyerTotal: reservations.loyerTotal,
  montantPaye: reservations.montantPaye,
  rawData: reservations.rawData,
  notes: reservations.notes,
  villaNom: villas.nom,
  villaNumero: villas.numero,
  beds24RoomId: villas.beds24RoomId,
};

async function chargerReservation(reservationId: string) {
  const [r] = await getDb()
    .select(SELECTION)
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r || !r.villaId) throw new Error("Réservation introuvable.");
  return { ...r, villaId: r.villaId };
}

function estPlateforme(r: { canal: string | null; source: string }): boolean {
  const canalKey = normaliseCanal(r.canal);
  return canalKey === "airbnb" || canalKey === "booking" || r.source === "beds24" || r.source === "superhote";
}

function entreesDirectes(rawData: unknown): EntreeDirecte[] {
  const liste = (rawData as { prolongations?: EntreeDirecte[] } | null)?.prolongations;
  return Array.isArray(liste) ? liste : [];
}

// Infos pour la fenêtre : mode qui s'appliquera, devise, valeurs par défaut, et prolongations déjà
// faites (donc annulables).
export async function infosProlongation(reservationId: string): Promise<{
  mode: "extension" | "direct";
  devise: string;
  heureDepart: string;
  prolongations: ProlongationListee[];
}> {
  await auth.protect();
  const r = await chargerReservation(reservationId);
  const mode = estPlateforme(r) ? "extension" : "direct";

  const prolongations: ProlongationListee[] = entreesDirectes(r.rawData).map((e) => ({
    id: e.id,
    mode: "direct",
    ancienDepart: e.ancienDepart,
    nouveauDepart: e.nouveauDepart,
    total: e.loyerAjoute,
    devise: r.devisePaiement,
    at: e.at,
  }));

  const extensions = await getDb()
    .select({
      id: reservations.id,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      loyerTotal: reservations.loyerTotal,
      devisePaiement: reservations.devisePaiement,
      createdAt: reservations.createdAt,
    })
    .from(reservations)
    .where(and(ne(reservations.status, "annulee"), sql`${reservations.rawData}->'prolongationDe'->>'origineId' = ${reservationId}`));
  for (const e of extensions) {
    prolongations.push({
      id: e.id,
      mode: "extension",
      ancienDepart: jour(e.checkIn),
      nouveauDepart: jour(e.checkOut),
      total: e.loyerTotal ? Number(e.loyerTotal) : null,
      devise: e.devisePaiement,
      at: e.createdAt.toISOString(),
    });
  }
  prolongations.sort((a, b) => a.at.localeCompare(b.at));

  return { mode, devise: r.devisePaiement, heureDepart: hhmm(r.checkOut), prolongations };
}

export type OptionsProlongation = {
  nouveauDepart: string; // YYYY-MM-DD
  heureDepart?: string; // HH:MM, par défaut l'heure de départ actuelle
  prixNuit?: number | string | null;
  devise?: string; // ignorée pour une réservation déjà directe (garde sa devise)
  montantRecu?: number | string | null;
  note?: string;
};

export async function prolongerSejour(
  reservationId: string,
  options: OptionsProlongation
): Promise<{ id: string; mode: "extension" | "direct"; beds24Statut: Beds24Statut; beds24Detail: string; menageAChecker: boolean }> {
  await auth.protect();

  const nouveauDepart = options.nouveauDepart;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nouveauDepart)) throw new Error("Date de départ invalide.");
  const heure = options.heureDepart && /^\d{2}:\d{2}$/.test(options.heureDepart) ? options.heureDepart : null;

  const db = getDb();
  const r = await chargerReservation(reservationId);
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
  nouveauCheckOut.setUTCFullYear(y, m - 1, d); // garde l'heure de départ d'origine…
  if (heure) nouveauCheckOut.setUTCHours(Number(heure.slice(0, 2)), Number(heure.slice(3, 5)), 0, 0); // …sauf si corrigée

  const nuits = nbNuits(ancienDepart, nouveauDepart);
  const prixNuit = montant(options.prixNuit);
  const total = prixNuit ? Math.round(prixNuit * nuits * 100) / 100 : null;
  const recu = montant(options.montantRecu);
  const note = (options.note ?? "").trim();

  const mode: "extension" | "direct" = estPlateforme(r) ? "extension" : "direct";
  const detailPrix = prixNuit ? ` · ${prixNuit} / nuit` : "";
  let cibleId = r.id;
  let devise = r.devisePaiement;

  if (mode === "extension") {
    devise = (options.devise ?? "").trim() || r.devisePaiement;
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
        notes: [`Prolongation en direct du séjour ${r.canal ?? "plateforme"} (départ initial le ${jjmm(ancienDepart)}).`, note].filter(Boolean).join(" "),
        source: "manuel",
        canal: "Direct",
        status: "confirmee",
        devisePaiement: devise,
        loyerTotal: total ? total.toFixed(2) : null,
        montantPaye: recu ? recu.toFixed(2) : null,
        rawData: { prolongationDe: { origineId: r.id, ancienDepart, nouveauDepart } },
      })
      .returning({ id: reservations.id });
    cibleId = ext.id;
  } else {
    const loyerActuel = r.loyerTotal ? Number(r.loyerTotal) : null;
    const payeActuel = r.montantPaye ? Number(r.montantPaye) : null;
    const entree: EntreeDirecte = {
      id: randomUUID(),
      ancienCheckOut: r.checkOut.toISOString(),
      ancienDepart,
      nouveauDepart,
      loyerAjoute: total,
      montantAjoute: recu,
      noteAjoutee: note ? `Prolongation : ${note}` : null,
      ferme: false,
      at: new Date().toISOString(),
    };
    // Enregistré avant la fermeture Beds24 pour que l'annulation fonctionne même si elle échoue.
    entree.ferme = Boolean(r.beds24RoomId);
    await db
      .update(reservations)
      .set({
        checkOut: nouveauCheckOut,
        ...(total ? { loyerTotal: ((loyerActuel ?? 0) + total).toFixed(2) } : {}),
        ...(recu ? { montantPaye: ((payeActuel ?? 0) + recu).toFixed(2) } : {}),
        ...(entree.noteAjoutee ? { notes: [r.notes, entree.noteAjoutee].filter(Boolean).join(" · ") } : {}),
        rawData: { ...((r.rawData as Record<string, unknown> | null) ?? {}), prolongations: [...entreesDirectes(r.rawData), entree] },
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, r.id));
    cibleId = entree.id;
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

  const resume = `${r.guestName} · départ ${jjmm(ancienDepart)} → ${jjmm(nouveauDepart)} (${nuits} nuit${nuits > 1 ? "s" : ""})${detailPrix}${total ? ` · ${total} ${devise}` : ""}${mode === "extension" ? " · prolongation en direct" : ""}`;
  await journaliser({
    action: "prolongation",
    libelle: mode === "extension" ? "Séjour prolongé en direct" : "Séjour prolongé",
    auteur: await auteurConnecte(),
    reservationId: mode === "extension" ? cibleId : r.id,
    villaId: r.villaId,
    villaNom: r.villaNom,
    resume,
    beds24Statut,
    beds24Detail,
  });
  await notifierKamelTelegram(
    `Séjour prolongé : ${r.villaNom ?? "villa"} - ${resume}${beds24Statut === "echec" ? "\nAttention : le calendrier n'a PAS pu être bloqué sur Beds24." : ""}`
  );

  revaliderTout();
  return { id: cibleId, mode, beds24Statut, beds24Detail, menageAChecker: mode === "extension" };
}

// Revient en arrière : supprime la réservation de prolongation (mode extension, ses nuits sont
// rouvertes et son ménage retiré par deleteReservation) ou remet l'ancien départ, l'ancien prix
// et rouvre les nuits (mode direct). `entreeId` vient de infosProlongation / du retour de
// prolongerSejour.
export async function annulerProlongation(
  reservationId: string,
  entreeId: string
): Promise<{ beds24Statut: Beds24Statut; beds24Detail: string }> {
  await auth.protect();
  const db = getDb();
  const r = await chargerReservation(reservationId);

  let beds24Statut: Beds24Statut = "non_concerne";
  let beds24Detail = "";
  let resume: string;

  const entree = entreesDirectes(r.rawData).find((e) => e.id === entreeId);
  if (entree) {
    // Garde-fou : on ne défait que la DERNIÈRE prolongation, et seulement si le départ n'a pas
    // bougé depuis (sinon on écraserait une autre modification).
    const liste = entreesDirectes(r.rawData);
    if (liste[liste.length - 1]?.id !== entreeId) throw new Error("Annule d'abord la prolongation la plus récente.");
    if (jour(r.checkOut) !== entree.nouveauDepart) throw new Error("Le départ a été modifié depuis : annulation automatique impossible.");

    const loyerActuel = r.loyerTotal ? Number(r.loyerTotal) : null;
    const payeActuel = r.montantPaye ? Number(r.montantPaye) : null;
    await db
      .update(reservations)
      .set({
        checkOut: new Date(entree.ancienCheckOut),
        ...(entree.noteAjoutee && r.notes ? { notes: r.notes.replace(` · ${entree.noteAjoutee}`, "").replace(entree.noteAjoutee, "").trim() || null } : {}),
        ...(entree.loyerAjoute && loyerActuel !== null ? { loyerTotal: Math.max(0, loyerActuel - entree.loyerAjoute).toFixed(2) } : {}),
        ...(entree.montantAjoute && payeActuel !== null ? { montantPaye: Math.max(0, payeActuel - entree.montantAjoute).toFixed(2) } : {}),
        rawData: { ...((r.rawData as Record<string, unknown> | null) ?? {}), prolongations: liste.filter((e) => e.id !== entreeId) },
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, r.id));

    const derniere = derniereNuit(entree.ancienDepart, entree.nouveauDepart);
    if (entree.ferme && r.beds24RoomId && derniere) {
      const res = await rouvrirDatesBeds24(Number(r.beds24RoomId), entree.ancienDepart, derniere);
      beds24Statut = res.statut;
      beds24Detail = res.detail;
      if (res.statut === "echec") console.error("Échec réouverture Beds24 (annulation prolongation):", res.detail);
    } else {
      beds24Detail = "Aucune nuit à rouvrir dans Beds24.";
    }
    resume = `${r.guestName} · départ remis au ${jjmm(entree.ancienDepart)} (prolongation jusqu'au ${jjmm(entree.nouveauDepart)} annulée)`;
  } else {
    // Mode extension : `entreeId` est la réservation de prolongation de cette réservation.
    const [ext] = await db
      .select({ id: reservations.id, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
      .from(reservations)
      .where(and(eq(reservations.id, entreeId), sql`${reservations.rawData}->'prolongationDe'->>'origineId' = ${reservationId}`))
      .limit(1);
    if (!ext) throw new Error("Prolongation introuvable (déjà annulée ?).");
    await deleteReservation(ext.id);
    beds24Detail = "Prolongation supprimée, nuits rouvertes dans Beds24 (Airbnb + Booking.com) et ménage retiré.";
    resume = `${r.guestName} · prolongation du ${jjmm(jour(ext.checkIn))} au ${jjmm(jour(ext.checkOut))} annulée`;
  }

  await journaliser({
    action: "prolongation_annulee",
    libelle: "Prolongation annulée",
    auteur: await auteurConnecte(),
    reservationId: r.id,
    villaId: r.villaId,
    villaNom: r.villaNom,
    resume,
    beds24Statut,
    beds24Detail,
  });
  await notifierKamelTelegram(`Prolongation annulée : ${r.villaNom ?? "villa"} - ${resume}`);

  revaliderTout();
  return { beds24Statut, beds24Detail };
}

function revaliderTout() {
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/reservations");
  revalidatePath("/calendrier");
  revalidatePath("/journal");
}
