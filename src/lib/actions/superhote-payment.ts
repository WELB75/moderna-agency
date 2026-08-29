"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { superhotePaymentSessions, villas } from "@/db/schema";
import { getVillaStripePublicKey, submitBooking } from "@/lib/superhote/client";
import { createPaymentSessionCore } from "@/lib/superhote/payment-session";

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
  // Superhote ne renvoie aucun champ devise dans get-availabilities — les montants pour Villa
  // Sofya correspondent au tarif EUR déjà documenté (whatsapp-agent/villas.ts), donc EUR par
  // défaut. Kamel, 2026-08-08 : possibilité d'afficher en euros plutôt que dirhams.
  devise?: "EUR" | "MAD";
}) {
  await auth.protect();
  const user = await currentUser();

  const session = await createPaymentSessionCore({
    ...input,
    createdByUserId: user?.id ?? null,
    createdByName: user?.fullName ?? user?.username ?? "Équipe",
  });

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
