"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { superhotePaymentSessions, villas } from "@/db/schema";
import { getPriceBreakdown, getVillaStripePublicKey, submitBooking } from "@/lib/superhote/client";

// Réservé à l'équipe (page protégée) : crée un lien de paiement à envoyer au client. Le prix est
// figé ici — get-availabilities est interrogé une seule fois, à la création — pour que le
// montant affiché au client pendant qu'il paie ne bouge jamais et ne soit jamais manipulable via
// l'URL publique du lien.
export async function createPaymentSession(input: {
  villaId: string;
  dateArrivee: string;
  dateDepart: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  paysIso: string;
  nbAdultes: number;
  nbEnfants: number;
}) {
  await auth.protect();
  const user = await currentUser();
  const db = getDb();

  const [villa] = await db.select({ superhoteListingId: villas.superhoteListingId }).from(villas).where(eq(villas.id, input.villaId)).limit(1);
  if (!villa?.superhoteListingId) throw new Error("Cette villa n'a pas de property_key Superhote configuré.");

  const breakdown = await getPriceBreakdown(villa.superhoteListingId, input.dateArrivee, input.dateDepart);
  if (!breakdown.disponible) throw new Error("Ces dates ne sont pas disponibles selon Superhote.");

  const [session] = await db
    .insert(superhotePaymentSessions)
    .values({
      villaId: input.villaId,
      propertyKey: villa.superhoteListingId,
      guestPrenom: input.prenom,
      guestNom: input.nom,
      guestEmail: input.email,
      guestTelephone: input.telephone,
      guestPays: input.paysIso,
      dateArrivee: input.dateArrivee,
      dateDepart: input.dateDepart,
      nbAdultes: input.nbAdultes,
      nbEnfants: input.nbEnfants,
      price: breakdown.price.toFixed(2),
      cleaning: breakdown.cleaning.toFixed(2),
      cityTaxes: breakdown.cityTaxes.toFixed(2),
      devise: "MAD",
      createdByUserId: user?.id ?? null,
      createdByName: user?.fullName ?? user?.username ?? "Équipe",
    })
    .returning();

  revalidatePath(`/villas/${input.villaId}`);
  return session;
}

// Volontairement sans auth.protect() : le client paie via le lien public /payer/[id].
export async function getPaymentSessionPublic(sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select({
      id: superhotePaymentSessions.id,
      villaId: superhotePaymentSessions.villaId,
      villaNom: villas.nom,
      propertyKey: superhotePaymentSessions.propertyKey,
      guestPrenom: superhotePaymentSessions.guestPrenom,
      guestNom: superhotePaymentSessions.guestNom,
      dateArrivee: superhotePaymentSessions.dateArrivee,
      dateDepart: superhotePaymentSessions.dateDepart,
      nbAdultes: superhotePaymentSessions.nbAdultes,
      nbEnfants: superhotePaymentSessions.nbEnfants,
      price: superhotePaymentSessions.price,
      cleaning: superhotePaymentSessions.cleaning,
      cityTaxes: superhotePaymentSessions.cityTaxes,
      devise: superhotePaymentSessions.devise,
      statut: superhotePaymentSessions.statut,
    })
    .from(superhotePaymentSessions)
    .leftJoin(villas, eq(villas.id, superhotePaymentSessions.villaId))
    .where(eq(superhotePaymentSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  const stripePublicKey = await getVillaStripePublicKey(session.propertyKey);
  return { ...session, stripePublicKey };
}

// Volontairement sans auth.protect() : appelé depuis la page publique une fois la carte
// tokenisée côté client (stripe.createToken()) — jamais de numéro de carte en clair ici.
export async function payWithCardToken(sessionId: string, cardToken: string) {
  const db = getDb();
  const [session] = await db.select().from(superhotePaymentSessions).where(eq(superhotePaymentSessions.id, sessionId)).limit(1);
  if (!session) throw new Error("Session de paiement introuvable.");
  if (session.statut === "paye") return { statut: "paye" as const };

  const result = await submitBooking({
    propertyKey: session.propertyKey,
    dateArrivee: session.dateArrivee,
    dateDepart: session.dateDepart,
    prenom: session.guestPrenom,
    nom: session.guestNom,
    email: session.guestEmail,
    telephone: session.guestTelephone,
    paysIso: session.guestPays,
    nbAdultes: session.nbAdultes,
    nbEnfants: session.nbEnfants,
    price: Number(session.price),
    cleaning: Number(session.cleaning),
    cityTaxes: Number(session.cityTaxes),
    cardToken,
  });

  if (result.statut === "confirme") {
    await db
      .update(superhotePaymentSessions)
      .set({ statut: "paye", superhoteBookingId: result.superhoteBookingId, updatedAt: new Date() })
      .where(eq(superhotePaymentSessions.id, sessionId));
    return { statut: "paye" as const };
  }
  if (result.statut === "requires_3ds") {
    await db
      .update(superhotePaymentSessions)
      .set({ statut: "requires_3ds", stripeIntentId: result.intentClientSecret, updatedAt: new Date() })
      .where(eq(superhotePaymentSessions.id, sessionId));
    return { statut: "requires_3ds" as const, intentClientSecret: result.intentClientSecret };
  }
  await db
    .update(superhotePaymentSessions)
    .set({ statut: "echoue", erreur: result.erreur, updatedAt: new Date() })
    .where(eq(superhotePaymentSessions.id, sessionId));
  return { statut: "echoue" as const, erreur: result.erreur };
}
