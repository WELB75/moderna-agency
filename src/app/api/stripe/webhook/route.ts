import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, secretWebhookStripe, StripeConfigError } from "@/lib/caution/stripe";
import { enregistrerSessionTerminee, traiterEmpreinteAnnulee, traiterEmpreinteCapturee } from "@/lib/caution/service";

export const maxDuration = 30;

// Webhook Stripe (Dashboard Stripe > Développeurs > Webhooks, adresse
// https://<domaine de l'app>/api/stripe/webhook) : événements checkout.session.completed,
// payment_intent.canceled et payment_intent.succeeded. La signature est vérifiée avec
// STRIPE_WEBHOOK_SECRET : sans elle valide, la requête est rejetée et rien n'est lu.
// Route publique (voir proxy.ts), donc la signature est la seule protection.
export async function POST(req: NextRequest) {
  let event: Stripe.Event;
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
    // Corps brut obligatoire : la signature porte sur les octets exacts reçus.
    const corps = await req.text();
    event = await getStripe().webhooks.constructEventAsync(corps, signature, secretWebhookStripe());
  } catch (err) {
    if (err instanceof StripeConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await enregistrerSessionTerminee((event.data.object as Stripe.Checkout.Session).id);
        break;
      case "payment_intent.canceled":
        await traiterEmpreinteAnnulee(event.data.object as Stripe.PaymentIntent);
        break;
      case "payment_intent.succeeded":
        await traiterEmpreinteCapturee(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        break; // autres événements : accusés sans traitement
    }
  } catch (err) {
    // Réponse 500 : Stripe réessaie automatiquement (plusieurs heures), le traitement est idempotent.
    console.error(`Webhook Stripe ${event.type} : échec du traitement`, err);
    return NextResponse.json({ error: "Traitement échoué." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
