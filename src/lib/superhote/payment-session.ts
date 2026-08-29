import { getDb } from "@/db";
import { superhotePaymentSessions, villas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPriceBreakdown } from "./client";

// Cœur de la création d'une session de paiement Superhote/Stripe, sans aucune vérification
// d'auth — volontairement PAS dans un fichier "use server" (contrairement à
// lib/actions/superhote-payment.ts) pour ne jamais être exposable comme Server Action
// appelable directement depuis un navigateur. Les deux seuls appelants légitimes sont :
// createPaymentSession (action protégée par Clerk, utilisée par l'équipe) et l'agent WhatsApp
// (code serveur déclenché uniquement par le webhook Meta, jamais par un client web).
export async function createPaymentSessionCore(input: {
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
  devise?: "EUR" | "MAD";
  createdByUserId?: string | null;
  createdByName?: string;
}) {
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
      devise: input.devise ?? "EUR",
      createdByUserId: input.createdByUserId ?? null,
      createdByName: input.createdByName ?? "Équipe",
    })
    .returning();

  return session;
}
