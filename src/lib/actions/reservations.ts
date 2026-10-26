"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import { getDb } from "@/db";
import { randomBytes } from "node:crypto";
import { reservations, villas } from "@/db/schema";
import { reservationRecaps } from "@/db/schema-recaps";
import { conflitsSejour } from "@/lib/disponibilite";
import { runIcalSync } from "@/lib/ical/sync";
import { nowInMorocco } from "@/lib/now";
import { parseSuperhoteCsv } from "@/lib/superhote-csv";
import { toTitleCase } from "@/lib/utils";
import { initiateMenageRequest } from "@/lib/whatsapp-agent/staff";
import { beds24WriteBookings } from "@/lib/beds24/client";
import { fermerDatesBeds24, rouvrirDatesBeds24 } from "@/lib/beds24/fermeture";
import { normaliseCanal } from "@/lib/canal";
import { libelleMotif } from "@/lib/annulation-resa";
import { notifierKamelTelegram } from "@/lib/telegram";
import { auteurConnecte, datesFermeesParLApp, journaliser, tracer, type Beds24Statut } from "@/lib/journal";

function resumeSejour(guestName: string, canal: string | null, checkIn: string, checkOut: string): string {
  const jjmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return `${guestName}${canal ? ` · ${canal}` : ""} · du ${jjmm(checkIn)} au ${jjmm(checkOut)}`;
}

// Villa + séjour lisible d'une réservation, pour le résumé du journal (une seule requête légère).
async function infoResaJournal(reservationId: string) {
  const db = getDb();
  const [r] = await db
    .select({ villaId: reservations.villaId, villaNom: villas.nom, guestName: reservations.guestName, checkIn: reservations.checkIn, checkOut: reservations.checkOut, canal: reservations.canal })
    .from(reservations)
    .leftJoin(villas, eq(villas.id, reservations.villaId))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return { reservationId, villaId: null, villaNom: null, sejour: "" };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { reservationId, villaId: r.villaId, villaNom: r.villaNom, sejour: resumeSejour(r.guestName, r.canal, iso(r.checkIn), iso(r.checkOut)) };
}

// Beds24 (inventory/rooms/calendar) : "to" est la DERNIÈRE NUIT incluse, pas le jour du départ.
// Bloquer jusqu'au jour du départ fermait à tort la nuit du départ (ex. résa Kawtar sur AZUR du
// 15 au 17/10/2026 : la nuit du 17 était fermée sur Airbnb). Renvoie null pour 0 nuit.
function derniereNuit(checkIn: string, checkOut: string): string | null {
  const debut = checkIn.slice(0, 10);
  const fin = format(subDays(new Date(`${checkOut.slice(0, 10)}T12:00:00`), 1), "yyyy-MM-dd");
  return fin < debut ? null : fin;
}

export async function createReservation(formData: FormData) {
  await auth.protect();

  const villaId = String(formData.get("villaId") ?? "");
  const guestName = toTitleCase(String(formData.get("guestName") ?? "").trim());
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "");
  const checkOut = String(formData.get("checkOut") ?? "");
  const nbAdultes = Number(formData.get("nbAdultes") ?? 0) || null;
  const nbEnfants = Number(formData.get("nbEnfants") ?? 0) || null;
  const guestsCount = (nbAdultes ?? 0) + (nbEnfants ?? 0) || null;
  const notes = String(formData.get("notes") ?? "").trim();
  // Plateforme d'origine (logos Airbnb/Booking/Direct côté wizard, voir platform-badge.tsx) et
  // prix — optionnels : Kamel, 2026-09-14, l'assistant de création manuelle ne doit pas forcer
  // à tout remplir d'un coup, ces infos peuvent être complétées après coup.
  // Type : "client" (défaut) ou blocage sans tarif / famille (ménage seulement) — voir l'assistant.
  const typeReservation = String(formData.get("typeReservation") ?? "client");
  const LIBELLES_TYPE: Record<string, string> = {
    proprietaire: "Blocage · Propriétaire",
    travaux: "Blocage · Travaux",
    autre: "Blocage · Autre",
    famille: "Famille",
  };
  const estBlocage = typeReservation === "proprietaire" || typeReservation === "travaux" || typeReservation === "autre";
  const estClientPayant = !LIBELLES_TYPE[typeReservation];
  const canal = LIBELLES_TYPE[typeReservation] ?? String(formData.get("canal") ?? "").trim();
  const loyerTotalRaw = estClientPayant ? String(formData.get("loyerTotal") ?? "").trim() : "";
  const devisePaiement = String(formData.get("devisePaiement") ?? "").trim();
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "").trim();
  const cautionRaw = estClientPayant ? String(formData.get("caution") ?? "").trim() : "";
  const fraisMenageRaw = String(formData.get("fraisMenage") ?? "").trim();

  if (!villaId || !guestName || !checkIn || !checkOut) {
    throw new Error("Villa, nom du client, arrivée et départ sont obligatoires.");
  }

  // Garde-fou serveur : jamais de réservation directe sur des nuits déjà prises (réservations de
  // l'app, calendrier Beds24 en direct, PriceLabs). Kamel, 2026-10-14 : "si on choisit une date et
  // que c'est pas dispo ça sera impossible à réserver".
  if (new Date(checkOut) <= new Date(checkIn)) {
    throw new Error("Le départ doit être après l'arrivée.");
  }
  const { conflits } = await conflitsSejour(villaId, checkIn, checkOut);
  if (conflits.length > 0) {
    const liste = conflits.slice(0, 4).map((n) => `${n.slice(8, 10)}/${n.slice(5, 7)}`).join(", ");
    throw new Error(`Ces dates ne sont plus disponibles (${liste}${conflits.length > 4 ? "…" : ""}). Choisis d'autres dates.`);
  }

  const db = getDb();
  const [reservation] = await db
    .insert(reservations)
    .values({
      villaId,
      guestName,
      guestPhone: guestPhone || null,
      guestEmail: guestEmail || null,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guestsCount,
      nbAdultes,
      nbEnfants,
      notes: notes || null,
      source: "manuel",
      canal: canal || "Direct",
      status: "confirmee",
      loyerTotal: loyerTotalRaw || null,
      devisePaiement: devisePaiement || "EUR",
      moyenPaiement: moyenPaiement || null,
      caution: cautionRaw || null,
      fraisMenage: fraisMenageRaw || null,
    })
    .returning({ id: reservations.id });

  // Sollicitation automatique d'une femme de ménage pour le nettoyage de fin de séjour — ne
  // doit jamais faire échouer la création de la réservation elle-même si ça plante.
  const [villa] = await db.select({ nom: villas.nom, numero: villas.numero, beds24RoomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, villaId)).limit(1);
  try {
    // Pas de ménage de départ à solliciter pour un simple blocage (propriétaire, travaux...).
    if (villa && !estBlocage) await initiateMenageRequest(reservation.id, villa.nom, villa.numero, checkOut.slice(0, 10));
  } catch (err) {
    console.error("Échec initiation demande ménage:", err);
  }

  // Bloque le calendrier Beds24 (répercuté vers Airbnb/Booking.com si la villa y est connectée)
  // — Kamel, 2026-09-15 : "pourquoi Superhote ça bloque le calendrier direct et nous non ?". Une
  // résa "Direct" créée à la main dans l'app n'existe nulle part ailleurs : sans ce blocage, rien
  // n'empêche une double réservation sur les autres canaux. Jamais pour Airbnb/Booking.com saisis
  // à la main : cette résa-là existe déjà côté Beds24 (remontée par runBeds24Sync).
  //
  // Volontairement un blocage de calendrier (numAvail), PAS une vraie réservation Beds24
  // (beds24WriteBookings) : créer un objet "réservation confirmée" puis l'annuler plus tard (à la
  // suppression) déclenche le verrou anti-abus d'Airbnb, qui bloque définitivement les dates
  // d'une réservation annulée côté hôte — vérifié en pratique à deux reprises le 2026-09-14/15.
  // Un blocage de calendrier est un geste hôte normal (fermer/rouvrir des dates), sans
  // réservation associée, donc réversible sans aucun risque.
  //
  // Bloque pour toute résa saisie à la main SAUF Airbnb : depuis la bascule du 12/10/2026,
  // Airbnb passe par Beds24, la résa y existe déjà. Booking.com est bloqué aussi : pendant la
  // bascule (et pour les villas encore gérées par SuperHote), une résa Booking saisie à la main
  // n'existe pas dans Beds24 et Airbnb restait ouvert (villa AZUR, 13/10/2026).
  //
  // Le résultat (fermeture relue et vérifiée dans Beds24) est renvoyé à l'assistant, qui affiche
  // une alerte en cas d'échec, et gardé dans le journal (fiche réservation, calendrier, /journal).
  let beds24Statut: Beds24Statut = "non_concerne";
  let beds24Detail = "";
  const derniere = derniereNuit(checkIn, checkOut);
  if (normaliseCanal(canal || "Direct") === "airbnb") {
    beds24Detail = "Réservation Airbnb : déjà présente dans Beds24, rien à fermer.";
  } else if (!villa?.beds24RoomId) {
    beds24Detail = "Logement non relié à Beds24 : dates non fermées sur Airbnb/Booking.com.";
  } else if (!derniere) {
    beds24Detail = "Aucune nuit à fermer.";
  } else {
    const resultat = await fermerDatesBeds24(Number(villa.beds24RoomId), checkIn.slice(0, 10), derniere);
    beds24Statut = resultat.statut;
    beds24Detail = resultat.detail;
    if (resultat.statut === "echec") console.error("Échec blocage calendrier Beds24:", resultat.detail);
  }

  await journaliser({
    action: "creation",
    auteur: await auteurConnecte(),
    reservationId: reservation.id,
    villaId,
    villaNom: villa?.nom ?? null,
    resume: resumeSejour(guestName, canal || "Direct", checkIn, checkOut),
    beds24Statut,
    beds24Detail,
  });

  // Prévient Kamel sur Telegram d'une réservation saisie dans l'app (pas pour un blocage
  // propriétaire/travaux) — les réservations des plateformes passent par la synchro.
  if (!estBlocage) {
    const auteur = await auteurConnecte();
    await notifierKamelTelegram(
      `Nouvelle réservation saisie dans l'app : ${villa?.nom ?? "villa"} - ${resumeSejour(guestName, canal || "Direct", checkIn, checkOut)}${auteur.nom ? ` (par ${auteur.nom})` : ""}`
    );
  }

  // Récapitulatif partageable (prix PriceLabs, promo, avance, remarque interne) + jeton du lien
  // public /s/[token] — jamais bloquant pour la création elle-même.
  let token: string | null = null;
  if (!estBlocage) {
  try {
    const num = (key: string) => {
      const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
      const n = Number(raw);
      return raw !== "" && Number.isFinite(n) ? n.toFixed(2) : null;
    };
    const promoTypeRaw = String(formData.get("promoType") ?? "");
    const promoType = promoTypeRaw === "pourcentage" || promoTypeRaw === "montant" ? promoTypeRaw : null;
    const modeRaw = String(formData.get("modeReglement") ?? "");
    token = randomBytes(16).toString("hex");
    await db.insert(reservationRecaps).values({
      reservationId: reservation.id,
      token,
      devise: devisePaiement || "EUR",
      prixPricelabs: num("prixPricelabs"),
      promoType: promoType && num("promoValeur") ? promoType : null,
      promoValeur: promoType ? num("promoValeur") : null,
      totalFinal: loyerTotalRaw ? num("loyerTotal") : null,
      avanceVersee: num("avanceVersee"),
      modeReglement: modeRaw === "sur_place" || modeRaw === "virement" ? modeRaw : null,
      remarqueInterne: String(formData.get("remarqueInterne") ?? "").trim() || null,
    });
  } catch (err) {
    console.error("Échec création du récapitulatif de réservation:", err);
    token = null;
  }
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath("/journal");

  return { id: reservation.id, token, beds24Statut, beds24Detail };
}

export async function updatePaymentInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) {
    throw new Error("Réservation introuvable.");
  }

  const loyerTotalRaw = String(formData.get("loyerTotal") ?? "").trim();
  const montantPayeRaw = String(formData.get("montantPaye") ?? "").trim();
  const cautionRaw = String(formData.get("caution") ?? "").trim();
  const cautionPayee = formData.get("cautionPayee") === "on";
  const moyenPaiement = String(formData.get("moyenPaiement") ?? "").trim();
  const notesPaiement = String(formData.get("notesPaiement") ?? "").trim();
  const devisePaiement = String(formData.get("devisePaiement") ?? "EUR").trim() || "EUR";

  const loyerTotal = loyerTotalRaw ? Number(loyerTotalRaw.replace(",", ".")).toFixed(2) : null;
  const montantPaye = montantPayeRaw ? Number(montantPayeRaw.replace(",", ".")).toFixed(2) : null;
  const caution = cautionRaw ? Number(cautionRaw.replace(",", ".")).toFixed(2) : null;

  const db = getDb();
  await db
    .update(reservations)
    .set({
      loyerTotal,
      montantPaye,
      caution,
      devisePaiement,
      cautionPayee,
      moyenPaiement: moyenPaiement || null,
      notesPaiement: notesPaiement || null,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({
    categorie: "paiement",
    action: "paiement_modifie",
    libelle: "Paiement modifié",
    resume: `${info.sejour} · loyer ${loyerTotal ?? "-"} ${devisePaiement}, reçu ${montantPaye ?? "-"} ${devisePaiement}, caution ${caution ?? "-"} (${cautionPayee ? "payée" : "non payée"})${moyenPaiement ? ` · ${moyenPaiement}` : ""}`,
    ...info,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Actions rapides pour le check-in physique : Kamel/l'équipe encaisse le solde restant et/ou
// récupère la caution sur place, et veut le noter en un clic plutôt que rouvrir le formulaire
// complet "Paiement" (Kamel, 2026-08-16 : "faut vraiment que j'ai un moyen de cliquer sur un
// bouton"). Solde marqué payé = montant reçu aligné sur le loyer total convenu.
export async function markSoldeRecu(reservationId: string, moyen: "especes" | "virement") {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  const [reservation] = await db.select({ loyerTotal: reservations.loyerTotal }).from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!reservation) throw new Error("Réservation introuvable.");

  await db
    .update(reservations)
    .set({
      montantPaye: reservation.loyerTotal,
      moyenPaiement: moyen === "especes" ? "Espèces" : "Virement",
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({
    categorie: "paiement",
    action: "solde_recu",
    libelle: "Solde reçu",
    resume: `${info.sejour} · ${reservation.loyerTotal ?? "-"} (${moyen === "especes" ? "espèces" : "virement"})`,
    ...info,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function markCautionRecue(reservationId: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db.update(reservations).set({ cautionPayee: true, updatedAt: new Date() }).where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({ categorie: "paiement", action: "caution_recue", libelle: "Caution reçue", resume: info.sejour, ...info });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Le sync iCal (voir ical/sync.ts) n'écrase plus jamais guestPhone sur une réservation
// existante — volontaire (Superhote exporte souvent un numéro local ambigu "0X..." qui
// écrasait une correction déjà faite à la main), mais ça laissait aucun moyen de corriger le
// numéro ensuite : une correction faite côté Superhote ne remonte donc jamais ici. Kamel,
// 2026-08-20 : "j'ai corrigé sur super hote mais il est toujours marocain dans notre système".
export async function updateGuestPhone(reservationId: string, phone: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({ guestPhone: phone.trim() || null, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({ categorie: "reservation", action: "telephone_modifie", libelle: "Téléphone du voyageur modifié", resume: info.sejour, ...info });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath(`/reservations/${reservationId}`);
}

// Nom affiché d'une réservation — Fouad, 2026-10-14, sur une résa Airbnb annulée restée à
// 0 € (Villa Nessya, été 2027) : "laisse Airbnb à la place de Hamza". Pour une réservation
// Beds24, la synchro remet le nom envoyé par le canal à chaque passage : la correction ne tient
// durablement que sur les réservations manuelles ou importées de SuperHote.
export async function updateGuestName(reservationId: string, name: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");
  const nom = name.trim();
  if (!nom) throw new Error("Le nom ne peut pas être vide.");

  const db = getDb();
  const avant = await infoResaJournal(reservationId);
  await db.update(reservations).set({ guestName: nom, updatedAt: new Date() }).where(eq(reservations.id, reservationId));
  await tracer({ categorie: "reservation", action: "nom_modifie", libelle: "Nom du voyageur modifié", resume: `${avant.sejour} → ${nom}`, ...avant });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath(`/reservations/${reservationId}`);
}

// Note libre sur la réservation (ex. "prévoir un lit bébé") — Kamel, 2026-09-28, relayant une
// question posée en regardant le calendrier Tarification : "c'est possible d'avoir une note ?
// pour les lit bébé etc...". Distincte de notesPaiement (qui ne concerne que le règlement).
export async function updateReservationNotes(reservationId: string, notes: string) {
  await auth.protect();
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({ categorie: "reservation", action: "note_modifiee", libelle: "Note de réservation modifiée", resume: info.sejour, ...info });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath(`/reservations/${reservationId}`);
}

const CHAMP_PAR_TYPE_MESSAGE = {
  arrivee: "messageArriveeEnvoyeAt",
  bienvenue: "messageBienvenueEnvoyeAt",
  localisation: "messageLocalisationEnvoyeAt",
  securite: "messageSecuriteEnvoyeAt",
  cuisine: "messageCuisineEnvoyeAt",
} as const;
export type TypeMessageCheckin = keyof typeof CHAMP_PAR_TYPE_MESSAGE;

// Marque un des 4 boutons WhatsApp de la carte check-in comme envoyé — Kamel, 2026-08-30 : "je
// veux qu'ils passe en mode fond vert au lieu de fond noir". Appelé juste après l'ouverture de
// WhatsApp (voir chaque bouton), jamais bloquant pour l'envoi lui-même si ça échoue.
export async function marquerMessageEnvoye(reservationId: string, type: TypeMessageCheckin) {
  await auth.protect();
  const db = getDb();
  await db
    .update(reservations)
    .set({ [CHAMP_PAR_TYPE_MESSAGE[type]]: new Date() })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({ categorie: "messagerie", action: "message_checkin_envoye", libelle: `Message WhatsApp "${type}" marqué envoyé`, resume: info.sejour, ...info });

  revalidatePath("/dashboard");
  revalidatePath(`/reservations/${reservationId}`);
}

export async function updateOperationalInfo(formData: FormData) {
  await auth.protect();

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) throw new Error("Réservation introuvable.");

  const db = getDb();
  await db
    .update(reservations)
    .set({
      assigneCheckin: String(formData.get("assigneCheckin") ?? "").trim() || null,
      formulaireBienvenueEnvoye: formData.get("formulaireBienvenueEnvoye") === "on",
      formulaireCheckinRecu: formData.get("formulaireCheckinRecu") === "on",
      aRelancer: formData.get("aRelancer") === "on",
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({ categorie: "reservation", action: "infos_operationnelles_modifiees", libelle: "Infos opérationnelles modifiées", resume: info.sejour, ...info });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Annulation locale depuis le calendrier : soft delete (statut "annulee"), la ligne et l'ID Beds24
// restent en base. La synchro Beds24 ne la recrée pas (voir statutApresSynchro) et rien n'est
// annulé côté Booking.com / Airbnb / Beds24 : c'est un simple nettoyage du planning, par exemple
// pour un client qui n'est jamais venu et dont la résa saisie à la main n'a pas d'ID Beds24.
// Planning, disponibilités, stats, exports iCal et liens propriétaires excluent déjà "annulee".
export async function annulerReservation(reservationId: string, motif: string): Promise<void> {
  await auth.protect();
  const libelleDuMotif = libelleMotif(motif);
  if (!libelleDuMotif) throw new Error("Choisis un motif d'annulation.");

  const db = getDb();
  const [reservation] = await db
    .select({
      villaId: reservations.villaId,
      villaNom: villas.nom,
      guestName: reservations.guestName,
      canal: reservations.canal,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      status: reservations.status,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!reservation) throw new Error("Réservation introuvable.");
  if (reservation.status === "annulee") return; // déjà annulée (double clic, autre onglet)

  const auteur = await auteurConnecte();
  const marqueur = { motif, par: auteur.nom, le: new Date().toISOString() };
  await db
    .update(reservations)
    .set({
      status: "annulee",
      rawData: sql`coalesce(${reservations.rawData}, '{}'::jsonb) || ${JSON.stringify({ annulationLocale: marqueur })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, reservationId));

  await journaliser({
    action: "annulation",
    auteur,
    reservationId,
    villaId: reservation.villaId,
    villaNom: reservation.villaNom,
    libelle: "Réservation annulée",
    categorie: "reservation",
    resume: `${resumeSejour(
      reservation.guestName,
      reservation.canal,
      format(reservation.checkIn, "yyyy-MM-dd"),
      format(reservation.checkOut, "yyyy-MM-dd")
    )} · motif : ${libelleDuMotif}`,
    beds24Statut: "non_concerne",
    beds24Detail: "Annulation locale uniquement : rien n'a été annulé sur Beds24 ni sur la plateforme.",
  });

  revalidatePath("/calendrier");
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/journal");
}

export async function deleteReservation(reservationId: string) {
  await auth.protect();
  const db = getDb();

  const [reservation] = await db
    .select({
      villaId: reservations.villaId,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      source: reservations.source,
      canal: reservations.canal,
      beds24BookingId: reservations.beds24BookingId,
      guestName: reservations.guestName,
      villaNom: villas.nom,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);

  // Réservation directe (ou blocage) qui existe aussi dans Beds24 : on l'annule là-bas d'abord,
  // pour que les dates se rouvrent vraiment sur Airbnb/Booking.com et qu'elle ne revienne pas à la
  // prochaine synchro. Kamel, 2026-10-14 : "je veux qu'on puisse supprimer directement dans notre
  // app et que ça supprime sur Beds24". Jamais pour une vraie réservation Airbnb/Booking.com
  // (annuler un voyageur réel se fait sur la plateforme). Si Beds24 refuse, on garde la ligne
  // locale et on remonte l'erreur plutôt que de laisser les dates fermées en silence.
  let annuleeSurBeds24 = false;
  if (
    reservation?.beds24BookingId &&
    reservation.villaId &&
    ["direct", "bloque"].includes(normaliseCanal(reservation.canal))
  ) {
    const [villaB24] = await db
      .select({ roomId: villas.beds24RoomId })
      .from(villas)
      .where(eq(villas.id, reservation.villaId))
      .limit(1);
    if (villaB24?.roomId) {
      const resultats = await beds24WriteBookings([
        {
          id: Number(reservation.beds24BookingId),
          roomId: Number(villaB24.roomId),
          status: "cancelled",
          arrival: format(reservation.checkIn, "yyyy-MM-dd"),
          departure: format(reservation.checkOut, "yyyy-MM-dd"),
        },
      ]);
      if (!resultats[0]?.success) {
        throw new Error(
          `Beds24 n'a pas annulé la réservation (${JSON.stringify(resultats[0] ?? {}).slice(0, 200)}). Rien n'a été supprimé.`
        );
      }
      annuleeSurBeds24 = true;
    }
  }

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  // Rouvre les dates sur le calendrier Beds24 — seulement pour une résa "Direct" créée à la main
  // dans l'app (voir createReservation, qui bloque le calendrier à la création) : jamais pour une
  // résa Airbnb/Booking.com remontée par runBeds24Sync, dont la suppression ici n'est qu'un
  // ménage local, pas une vraie annulation à répercuter. Toujours via numAvail (blocage de
  // calendrier), jamais via l'annulation d'une réservation Beds24 — voir le commentaire dans
  // createReservation sur le verrou anti-abus d'Airbnb.
  // Seulement pour une résa "Direct" : une résa Booking.com saisie à la main peut avoir un
  // doublon réel importé dans Beds24 ; rouvrir les dates en supprimant la copie manuelle
  // risquerait de rouvrir une nuit réellement réservée. Dans ce cas les dates restent bloquées
  // (à rouvrir à la main dans Beds24 si besoin) — on préfère un blocage en trop à un doublon.
  let beds24Statut: Beds24Statut = "non_concerne";
  let beds24Detail = annuleeSurBeds24
    ? "Réservation annulée dans Beds24."
    : "Dates laissées telles quelles dans Beds24 (réservation venant d'une plateforme ou non créée dans l'app).";
  // Résa de l'agent IA : rouverte seulement si l'app avait elle-même fermé ses dates (journal).
  const fermeeParAgentIa = reservation?.source === "whatsapp-ia" && (await datesFermeesParLApp(reservationId));
  if (
    (reservation?.source === "manuel" || annuleeSurBeds24 || fermeeParAgentIa) &&
    ["direct", "bloque"].includes(normaliseCanal(reservation?.canal)) &&
    reservation?.villaId
  ) {
    const [villa] = await db.select({ beds24RoomId: villas.beds24RoomId }).from(villas).where(eq(villas.id, reservation.villaId)).limit(1);
    const debut = format(reservation.checkIn, "yyyy-MM-dd");
    const derniere = derniereNuit(debut, format(reservation.checkOut, "yyyy-MM-dd"));
    if (villa?.beds24RoomId && derniere) {
      const resultat = await rouvrirDatesBeds24(Number(villa.beds24RoomId), debut, derniere);
      beds24Statut = resultat.statut;
      beds24Detail = resultat.detail;
      if (resultat.statut === "echec") console.error("Échec réouverture calendrier Beds24 après suppression:", resultat.detail);
    } else {
      beds24Detail = "Logement non relié à Beds24 : rien à rouvrir.";
    }
  }

  if (reservation) {
    await journaliser({
      action: "suppression",
      auteur: await auteurConnecte(),
      reservationId,
      villaId: reservation.villaId,
      villaNom: reservation.villaNom,
      resume: resumeSejour(
        reservation.guestName,
        reservation.canal,
        format(reservation.checkIn, "yyyy-MM-dd"),
        format(reservation.checkOut, "yyyy-MM-dd")
      ),
      beds24Statut,
      beds24Detail,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/villas");
  revalidatePath("/calendrier");
  revalidatePath("/journal");
}

// Bouton "Refermer les dates sur Beds24" de la fiche réservation, quand la fermeture faite à la
// création a échoué (ou pour s'assurer à nouveau qu'un blocage est bien en place partout).
export async function refermerDatesBeds24(reservationId: string): Promise<{ statut: Beds24Statut; detail: string }> {
  await auth.protect();
  const db = getDb();
  const [r] = await db
    .select({
      villaId: reservations.villaId,
      villaNom: villas.nom,
      beds24RoomId: villas.beds24RoomId,
      guestName: reservations.guestName,
      canal: reservations.canal,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) throw new Error("Réservation introuvable.");
  if (normaliseCanal(r.canal) === "airbnb") return { statut: "non_concerne", detail: "Réservation Airbnb : déjà bloquée par Airbnb lui-même." };
  if (!r.beds24RoomId) return { statut: "non_concerne", detail: "Logement non relié à Beds24." };

  const debut = format(r.checkIn, "yyyy-MM-dd");
  const fin = format(r.checkOut, "yyyy-MM-dd");
  const derniere = derniereNuit(debut, fin);
  if (!derniere) return { statut: "non_concerne", detail: "Aucune nuit à fermer." };

  const resultat = await fermerDatesBeds24(Number(r.beds24RoomId), debut, derniere);
  await journaliser({
    action: "fermeture_beds24",
    auteur: await auteurConnecte(),
    reservationId,
    villaId: r.villaId,
    villaNom: r.villaNom,
    resume: resumeSejour(r.guestName, r.canal, debut, fin),
    beds24Statut: resultat.statut,
    beds24Detail: resultat.detail,
  });

  revalidatePath(`/reservations/${reservationId}`);
  revalidatePath("/calendrier");
  revalidatePath("/journal");
  return resultat;
}

// Superhote n'exporte pas toujours l'heure exacte dans son flux iCal (ex. réservations
// Booking.com) : l'app retombe alors sur une heure par défaut (14h/11h) qui peut être fausse.
// Cette action permet de corriger l'heure à la main quand le staff connaît l'heure réelle
// (ex. vue directement dans l'app Superhote).
export async function updateReservationTimes(reservationId: string, checkInTime: string, checkOutTime: string) {
  await auth.protect();

  const [hIn, mIn] = checkInTime.split(":").map(Number);
  const [hOut, mOut] = checkOutTime.split(":").map(Number);
  if ([hIn, mIn, hOut, mOut].some((n) => Number.isNaN(n))) {
    throw new Error("Heure invalide.");
  }

  const db = getDb();
  const [current] = await db
    .select({
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      villaId: reservations.villaId,
      villaNom: villas.nom,
      guestName: reservations.guestName,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!current) throw new Error("Réservation introuvable.");

  const newCheckIn = new Date(current.checkIn);
  newCheckIn.setHours(hIn, mIn, 0, 0);
  const newCheckOut = new Date(current.checkOut);
  newCheckOut.setHours(hOut, mOut, 0, 0);

  await db
    .update(reservations)
    .set({ checkIn: newCheckIn, checkOut: newCheckOut, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));

  // Heures stockées "telles qu'affichées" (heure du Maroc en composants UTC, voir nowInMorocco).
  const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  await journaliser({
    action: "modification_heures",
    auteur: await auteurConnecte(),
    reservationId,
    villaId: current.villaId,
    villaNom: current.villaNom,
    resume: `${current.guestName} · arrivée ${hhmm(new Date(current.checkIn))} → ${hhmm(newCheckIn)}, départ ${hhmm(new Date(current.checkOut))} → ${hhmm(newCheckOut)}`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

// Confirme que le check-in/check-out a effectivement été fait sur place (distinct de l'heure
// prévue) : garde une trace de qui l'a validé et quand.
export async function validateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const user = await currentUser();
  const validePar = user?.fullName ?? user?.username ?? "Équipe";

  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: nowInMorocco(), checkinValidePar: validePar }
        : { checkoutValideAt: nowInMorocco(), checkoutValidePar: validePar }
    )
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({
    categorie: "reservation",
    action: kind === "in" ? "checkin_valide" : "checkout_valide",
    libelle: kind === "in" ? "Check-in validé" : "Check-out validé",
    resume: info.sejour,
    ...info,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

export async function unvalidateReservationEvent(reservationId: string, kind: "in" | "out") {
  await auth.protect();
  const db = getDb();
  await db
    .update(reservations)
    .set(
      kind === "in"
        ? { checkinValideAt: null, checkinValidePar: null }
        : { checkoutValideAt: null, checkoutValidePar: null }
    )
    .where(eq(reservations.id, reservationId));

  const info = await infoResaJournal(reservationId);
  await tracer({
    categorie: "reservation",
    action: kind === "in" ? "checkin_devalide" : "checkout_devalide",
    libelle: kind === "in" ? "Validation du check-in annulée" : "Validation du check-out annulée",
    resume: info.sejour,
    ...info,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

// L'iCal Superhote ne transmet pas les prix/paiements (limitation du format). Superhote propose
// en revanche un export CSV (Calendriers → Actions → Exporter les réservations) qui les contient :
// on rapproche chaque ligne à une réservation existante par villa + dates de séjour, et on remplit
// loyerTotal/montantPaye automatiquement, plutôt que de les ressaisir une par une à la main.
export async function importSuperhoteCsv(csvText: string) {
  await auth.protect();

  const rows = parseSuperhoteCsv(csvText);
  if (rows.length === 0) throw new Error("Fichier vide ou illisible.");

  const db = getDb();
  const allVillas = await db.select({ id: villas.id, nom: villas.nom }).from(villas);
  const allReservations = await db.select().from(reservations);

  let matched = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const rentalRaw = (row["rental"] ?? "").toLowerCase();
    const villa = allVillas
      .filter((v) => v.nom && rentalRaw.startsWith(v.nom.toLowerCase()))
      .sort((a, b) => b.nom.length - a.nom.length)[0];

    const guestLabel = `${row["guest first name"] ?? ""} ${row["guest last name"] ?? ""}`.trim();
    const checkinRaw = row["checkin"];
    const checkoutRaw = row["checkout"];

    if (!villa || !checkinRaw || !checkoutRaw) {
      unmatched.push(`${guestLabel} (${checkinRaw || "date inconnue"})`);
      continue;
    }

    const checkin = new Date(checkinRaw + "T00:00:00Z");
    const checkout = new Date(checkoutRaw + "T00:00:00Z");
    const reservation = allReservations.find(
      (r) => r.villaId === villa.id && sameCalendarDay(new Date(r.checkIn), checkin) && sameCalendarDay(new Date(r.checkOut), checkout)
    );

    if (!reservation) {
      unmatched.push(`${guestLabel} (${checkinRaw})`);
      continue;
    }

    const totalPrice = row["total price"] ? Number(row["total price"]) : null;
    const totalPayments = row["total payments"] ? Number(row["total payments"]) : null;
    const newStatus = row["status"] === "Cancelled" ? "annulee" : reservation.status;

    await db
      .update(reservations)
      .set({
        loyerTotal: totalPrice !== null && !Number.isNaN(totalPrice) ? totalPrice.toFixed(2) : reservation.loyerTotal,
        montantPaye: totalPayments !== null && !Number.isNaN(totalPayments) ? totalPayments.toFixed(2) : reservation.montantPaye,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, reservation.id));

    matched++;
  }

  await tracer({
    categorie: "reservation",
    action: "import_csv_superhote",
    libelle: "Import CSV Superhote",
    resume: `${matched} réservation(s) mise(s) à jour, ${unmatched.length} sans correspondance`,
  });

  revalidatePath("/dashboard");
  revalidatePath("/villas");

  return { matched, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 10) };
}

export async function triggerIcalSync() {
  await auth.protect();
  const result = await runIcalSync();
  revalidatePath("/dashboard");
  revalidatePath("/villas");
  if (!result.success) return { success: false, message: result.error };
  const summary =
    `${result.bookingsSynced} réservation(s) synchronisée(s) (${result.villasSynced} villa(s))` +
    (result.bookingsCancelled > 0 ? ` · ${result.bookingsCancelled} annulée(s)` : "") +
    ".";
  // Synchro partielle : affichée en erreur pour que le lien mort ne passe pas inaperçu.
  if (result.failedVillas.length > 0) {
    const failed = result.failedVillas.map((f) => `${f.nom} (${f.reason})`).join(", ");
    return { success: false, message: `${summary} Lien iCal à mettre à jour : ${failed}.` };
  }
  return { success: true, message: summary };
}
