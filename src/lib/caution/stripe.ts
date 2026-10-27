import Stripe from "stripe";

// Client Stripe du compte "Moderna Agency" (celui aussi relié à Beds24). La clé secrète vient
// UNIQUEMENT de l'environnement Vercel (STRIPE_SECRET_KEY) : elle ne doit jamais être écrite dans
// le code ni dans un fichier du dépôt.
export class StripeConfigError extends Error {}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;
  const cle = process.env.STRIPE_SECRET_KEY;
  if (!cle) throw new StripeConfigError("STRIPE_SECRET_KEY manquant dans l'environnement.");
  client = new Stripe(cle);
  return client;
}

export function secretWebhookStripe(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeConfigError("STRIPE_WEBHOOK_SECRET manquant dans l'environnement.");
  return secret;
}

export function stripeConfigure(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}
