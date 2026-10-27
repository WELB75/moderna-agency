import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { beds24AddInfoItems } from "@/lib/beds24/client";
import { STRIPE_AUTORISATION_INFO_CODE } from "@/lib/beds24/sync";
import { BEDS24_VILLA_MAPPING } from "@/lib/beds24/mapping";
import { getBaseUrl } from "@/lib/base-url";
import { tracer, type Auteur } from "@/lib/journal";
import { nowInMorocco } from "@/lib/now";
import { notifierKamelTelegram } from "@/lib/telegram";
import { cautionDemandable, doitLeverAutomatiquement, doitRenouveler, enCentimes, formatEuros } from "./regles";
import { getStripe } from "./stripe";
import {
  cautionDeLaReservation,
  cautionDeLaSession,
  cautionDuPaymentIntent,
  cautionsAutorisees,
  changerStatut,
  marquerAutorisee,
  noterEchec,
  preparerCaution,
  type Caution,
} from "./store";

// Caution par empreinte bancaire Stripe, en direct (sans passer par bookpay.php de Beds24).
//
// Parcours : le message Beds24 envoie /caution/[n° de réservation] -> page de l'app -> Stripe
// Checkout (empreinte en capture manuelle : aucun débit) -> webhook Stripe -> l'app marque la
// caution reçue (et pose le code STRIPEAUTHORIZE sur la réservation Beds24, ce qui empêche le
// rappel du jour J de partir, voir lib/beds24/sync.ts).

export const AUTEUR_CAUTION_STRIPE: Auteur = { type: "systeme", id: null, nom: "Caution Stripe (automatique)", email: null };

export type ContexteCaution = {
  reservationId: string;
  beds24BookingId: string;
  villaId: string | null;
  villaNom: string;
  prenom: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  montantCentimes: number;
  status: string;
  canal: string | null;
};

// Montant demandé : celui de la réservation (posé par la synchro Beds24 selon la villa), à défaut
// celui du groupe de la propriété (lib/beds24/mapping.ts).
function montantDemande(caution: string | null, beds24RoomId: string | null): number | null {
  const direct = enCentimes(caution);
  if (direct) return direct;
  const mapping = beds24RoomId ? BEDS24_VILLA_MAPPING.find((m) => String(m.roomId) === beds24RoomId) : null;
  return mapping ? enCentimes(mapping.caution) : null;
}

export async function chargerContexteCaution(beds24BookingId: string): Promise<ContexteCaution | null> {
  if (!/^\d{4,12}$/.test(beds24BookingId)) return null;
  const [r] = await getDb()
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      checkIn: reservations.checkIn,
      checkOut: reservations.checkOut,
      status: reservations.status,
      canal: reservations.canal,
      caution: reservations.caution,
      villaId: villas.id,
      villaNom: villas.nom,
      beds24RoomId: villas.beds24RoomId,
    })
    .from(reservations)
    .leftJoin(villas, eq(reservations.villaId, villas.id))
    .where(eq(reservations.beds24BookingId, beds24BookingId))
    .limit(1);
  if (!r) return null;
  const montant = montantDemande(r.caution, r.beds24RoomId);
  if (!montant) return null;
  const premier = r.guestName.trim().split(/\s+/)[0] ?? "";
  return {
    reservationId: r.id,
    beds24BookingId,
    villaId: r.villaId,
    villaNom: r.villaNom ?? "Votre logement",
    prenom: premier.charAt(0).toUpperCase() + premier.slice(1).toLowerCase(),
    guestName: r.guestName,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    montantCentimes: montant,
    status: r.status,
    canal: r.canal,
  };
}

export type EtatPageCaution =
  | { type: "introuvable" }
  | { type: "non_concernee"; raison: "airbnb" | "annulee" | "terminee" }
  | { type: "deja_enregistree"; ctx: ContexteCaution }
  | { type: "a_faire"; ctx: ContexteCaution };

export async function etatPageCaution(beds24BookingId: string): Promise<EtatPageCaution> {
  const ctx = await chargerContexteCaution(beds24BookingId);
  if (!ctx) return { type: "introuvable" };
  const demandable = cautionDemandable({ canal: ctx.canal, status: ctx.status, depart: ctx.checkOut, maintenant: nowInMorocco() });
  if (!demandable.ok) return { type: "non_concernee", raison: demandable.raison };
  const existante = await cautionDeLaReservation(ctx.reservationId);
  if (existante && (existante.statut === "autorisee" || existante.statut === "prelevee")) return { type: "deja_enregistree", ctx };
  return { type: "a_faire", ctx };
}

async function urlDeBase(): Promise<string> {
  const configuree = getBaseUrl();
  if (configuree) return configuree;
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
}

// Crée la session Stripe Checkout (page de saisie de carte hébergée par Stripe) et renvoie son
// adresse. Capture manuelle = empreinte, rien n'est débité. La carte est enregistrée pour pouvoir
// refaire l'empreinte pendant un long séjour.
export async function creerSessionCaution(beds24BookingId: string): Promise<string> {
  const etat = await etatPageCaution(beds24BookingId);
  if (etat.type !== "a_faire") throw new Error("Aucune caution à enregistrer pour cette réservation.");
  const { ctx } = etat;
  const base = await urlDeBase();
  const chemin = `/caution/${ctx.beds24BookingId}`;

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_creation: "always",
    client_reference_id: ctx.beds24BookingId,
    metadata: { reservationId: ctx.reservationId, beds24BookingId: ctx.beds24BookingId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: ctx.montantCentimes,
          product_data: {
            name: `Caution du séjour — ${ctx.villaNom}`,
            description: "Empreinte bancaire : aucun montant n'est débité.",
          },
        },
      },
    ],
    payment_intent_data: {
      capture_method: "manual",
      setup_future_usage: "off_session",
      description: `Caution ${ctx.villaNom} — réservation ${ctx.beds24BookingId}`,
      metadata: { reservationId: ctx.reservationId, beds24BookingId: ctx.beds24BookingId },
    },
    custom_text: {
      submit: {
        message:
          "Il s'agit d'une simple empreinte bancaire : aucun montant n'est débité. Elle est levée après votre départ, une fois l'état des lieux effectué. Pour un séjour de plus d'une semaine, l'empreinte est renouvelée automatiquement sur cette carte.",
      },
    },
    success_url: `${base}${chemin}?retour=ok&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}${chemin}?retour=annule`,
  });
  if (!session.url) throw new Error("Stripe n'a pas renvoyé d'adresse de paiement.");

  await preparerCaution({
    reservationId: ctx.reservationId,
    beds24BookingId: ctx.beds24BookingId,
    montantCentimes: ctx.montantCentimes,
    devise: "eur",
    checkoutSessionId: session.id,
  });
  return session.url;
}

const id = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

// Appelé par le webhook Stripe ET au retour du voyageur sur la page (même code, idempotent) : lit
// la session auprès de Stripe, et si l'empreinte est bien en place (requires_capture), enregistre
// la caution comme reçue. Ne fait jamais confiance au simple fait que le voyageur soit revenu.
export async function enregistrerSessionTerminee(checkoutSessionId: string): Promise<{ autorisee: boolean }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, { expand: ["payment_intent"] });
  const caution = await cautionDeLaSession(session.id);
  if (!caution) return { autorisee: false }; // session qui ne vient pas de l'app

  const pi = session.payment_intent && typeof session.payment_intent !== "string" ? session.payment_intent : null;
  if (!pi || pi.status !== "requires_capture") return { autorisee: false };
  if (caution.statut === "autorisee" && caution.paymentIntentId === pi.id) return { autorisee: true }; // déjà traitée

  await marquerAutorisee({
    id: caution.id,
    customerId: id(session.customer) ?? id(pi.customer),
    paymentMethodId: id(pi.payment_method),
    paymentIntentId: pi.id,
  });
  await apresAutorisation(caution, pi.id);
  return { autorisee: true };
}

async function apresAutorisation(caution: Caution, paymentIntentId: string): Promise<void> {
  const db = getDb();
  await db.update(reservations).set({ cautionPayee: true, updatedAt: new Date() }).where(eq(reservations.id, caution.reservationId));

  // Même code que celui posé par l'ancien lien Beds24 : il stoppe le rappel du jour J et la
  // synchro Beds24 le relit pour cocher "caution reçue". Échec toléré : la ligne locale fait foi.
  try {
    await beds24AddInfoItems([
      {
        id: Number(caution.beds24BookingId),
        infoItems: [{ code: STRIPE_AUTORISATION_INFO_CODE, text: `Empreinte ${formatEuros(caution.montantCentimes)} · ${paymentIntentId}` }],
      },
    ]);
  } catch (err) {
    console.error("Caution : code STRIPEAUTHORIZE non posé sur Beds24", err);
  }

  await tracer({
    categorie: "reservation",
    action: "caution_autorisee",
    libelle: "Caution enregistrée (empreinte Stripe)",
    resume: formatEuros(caution.montantCentimes),
    reservationId: caution.reservationId,
    auteur: AUTEUR_CAUTION_STRIPE,
  });
}

// ---------------------------------------------------------------- actions sur une empreinte

async function annulerPaymentIntent(paymentIntentId: string): Promise<void> {
  try {
    await getStripe().paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    // Déjà annulée ou expirée côté Stripe : rien à faire.
    const code = (err as { code?: string }).code;
    if (code !== "payment_intent_unexpected_state") throw err;
  }
}

export async function libererCaution(reservationId: string, auteur: Auteur): Promise<void> {
  const caution = await cautionDeLaReservation(reservationId);
  if (!caution || caution.statut !== "autorisee" || !caution.paymentIntentId) throw new Error("Aucune empreinte active à lever pour cette réservation.");
  await annulerPaymentIntent(caution.paymentIntentId);
  await changerStatut(caution.id, "liberee");
  await tracer({ categorie: "reservation", action: "caution_liberee", libelle: "Caution levée", resume: formatEuros(caution.montantCentimes), reservationId, auteur });
}

// Prélève tout ou partie de la caution (dégâts) : Stripe capture au plus le montant retenu, le
// reste de l'empreinte est rendu au voyageur.
export async function prelever(reservationId: string, montantCentimes: number, auteur: Auteur): Promise<void> {
  const caution = await cautionDeLaReservation(reservationId);
  if (!caution || caution.statut !== "autorisee" || !caution.paymentIntentId) throw new Error("Aucune empreinte active à prélever pour cette réservation.");
  if (!Number.isInteger(montantCentimes) || montantCentimes <= 0 || montantCentimes > caution.montantCentimes) {
    throw new Error(`Le montant doit être compris entre 0,01 € et ${formatEuros(caution.montantCentimes)}.`);
  }
  await getStripe().paymentIntents.capture(caution.paymentIntentId, { amount_to_capture: montantCentimes });
  await changerStatut(caution.id, "prelevee", { montantPreleveCentimes: montantCentimes });
  await tracer({
    categorie: "reservation",
    action: "caution_prelevee",
    libelle: "Caution prélevée (retenue sur dégâts)",
    resume: `${formatEuros(montantCentimes)} sur ${formatEuros(caution.montantCentimes)}`,
    reservationId,
    auteur,
  });
}

// Nouvelle empreinte sur la carte enregistrée (séjour long). On crée la nouvelle AVANT d'annuler
// l'ancienne : en cas d'échec, l'empreinte actuelle continue de couvrir le séjour.
async function renouvelerEmpreinte(caution: Caution): Promise<"ok" | "echec"> {
  if (!caution.customerId || !caution.paymentMethodId || !caution.paymentIntentId) {
    await noterEchec(caution.id, "Carte non enregistrée : renouvellement automatique impossible.");
    return "echec";
  }
  const stripe = getStripe();
  try {
    const nouveau = await stripe.paymentIntents.create({
      amount: caution.montantCentimes,
      currency: caution.devise,
      customer: caution.customerId,
      payment_method: caution.paymentMethodId,
      capture_method: "manual",
      confirm: true,
      off_session: true,
      description: `Caution (renouvellement) — réservation ${caution.beds24BookingId}`,
      metadata: { reservationId: caution.reservationId, beds24BookingId: caution.beds24BookingId, renouvellement: "oui" },
    });
    if (nouveau.status !== "requires_capture") {
      await noterEchec(caution.id, `Renouvellement non abouti (statut Stripe : ${nouveau.status}).`);
      await annulerPaymentIntent(nouveau.id).catch(() => undefined);
      return "echec";
    }
    const ancien = caution.paymentIntentId;
    await marquerAutorisee({ id: caution.id, customerId: caution.customerId, paymentMethodId: caution.paymentMethodId, paymentIntentId: nouveau.id });
    await annulerPaymentIntent(ancien).catch((err) => console.error("Caution : ancienne empreinte non annulée", err));
    await tracer({
      categorie: "reservation",
      action: "caution_renouvelee",
      libelle: "Empreinte de caution renouvelée",
      resume: formatEuros(caution.montantCentimes),
      reservationId: caution.reservationId,
      auteur: AUTEUR_CAUTION_STRIPE,
    });
    return "ok";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Stripe inconnue.";
    await noterEchec(caution.id, message);
    return "echec";
  }
}

// ---------------------------------------------------------------- tâche quotidienne

export type BilanSweep = { renouvelees: number; echecs: number; levees: number; verifiees: number };

export async function balayerCautions(): Promise<BilanSweep> {
  const bilan: BilanSweep = { renouvelees: 0, echecs: 0, levees: 0, verifiees: 0 };
  const maintenant = nowInMorocco();
  const actives = await cautionsAutorisees();

  for (const caution of actives) {
    bilan.verifiees += 1;
    try {
      const [r] = await getDb().select({ checkOut: reservations.checkOut, guestName: reservations.guestName, status: reservations.status }).from(reservations).where(eq(reservations.id, caution.reservationId)).limit(1);
      if (!r) continue;

      // Réservation annulée entre-temps : on rend l'empreinte tout de suite.
      if (r.status === "annulee" && caution.paymentIntentId) {
        await annulerPaymentIntent(caution.paymentIntentId);
        await changerStatut(caution.id, "liberee");
        bilan.levees += 1;
        continue;
      }

      if (doitLeverAutomatiquement({ statut: caution.statut, depart: r.checkOut, maintenant })) {
        if (caution.paymentIntentId) await annulerPaymentIntent(caution.paymentIntentId);
        await changerStatut(caution.id, "liberee");
        await tracer({ categorie: "reservation", action: "caution_liberee", libelle: "Caution levée automatiquement après le séjour", resume: formatEuros(caution.montantCentimes), reservationId: caution.reservationId, auteur: AUTEUR_CAUTION_STRIPE });
        bilan.levees += 1;
        continue;
      }

      if (doitRenouveler({ statut: caution.statut, autoriseeAt: caution.autoriseeAt, depart: r.checkOut, maintenant })) {
        const resultat = await renouvelerEmpreinte(caution);
        if (resultat === "ok") bilan.renouvelees += 1;
        else {
          bilan.echecs += 1;
          await notifierKamelTelegram(
            `⚠️ Caution : impossible de renouveler l'empreinte de ${r.guestName} (réservation ${caution.beds24BookingId}). L'empreinte actuelle expire bientôt : contactez le voyageur pour qu'il refasse la caution via son lien.`
          );
        }
      }
    } catch (err) {
      console.error(`Caution ${caution.beds24BookingId} : erreur pendant le balayage`, err);
      bilan.echecs += 1;
    }
  }
  return bilan;
}

// ---------------------------------------------------------------- événements Stripe

// Empreinte annulée ou expirée côté Stripe sans action de l'app (7 jours dépassés, banque...) :
// la caution n'est plus couverte. Les annulations faites par l'app elle-même (levée, remplacement
// par une nouvelle empreinte) ont déjà changé le statut ou le PaymentIntent courant : ignorées.
export async function traiterEmpreinteAnnulee(pi: Stripe.PaymentIntent): Promise<void> {
  const caution = await cautionDuPaymentIntent(pi.id);
  if (!caution || caution.statut !== "autorisee") return;
  await changerStatut(caution.id, "expiree", { echec: "Empreinte annulée ou expirée côté Stripe." });
}

export async function traiterEmpreinteCapturee(pi: Stripe.PaymentIntent): Promise<void> {
  const caution = await cautionDuPaymentIntent(pi.id);
  if (!caution || caution.statut === "prelevee") return;
  await changerStatut(caution.id, "prelevee", { montantPreleveCentimes: pi.amount_received || undefined });
}
