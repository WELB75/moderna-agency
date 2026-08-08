"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import { payWithCardToken } from "@/lib/actions/superhote-payment";

// Superhote exige spécifiquement un token Stripe "tok_..." (Card Element + stripe.createToken()),
// pas un "pm_..." du Payment Element moderne — confirmé par leur support le 2026-08-08. D'où le
// choix volontaire du Card Element ici plutôt que le composant PaymentElement plus récent.
export function PaymentForm({
  sessionId,
  stripePublicKey,
  statut,
  guestPrenom,
}: {
  sessionId: string;
  stripePublicKey: string;
  statut: string;
  guestPrenom: string;
}) {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const cardMountRef = useRef<HTMLDivElement>(null);
  const [cardReady, setCardReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"paye" | "requires_3ds" | null>(statut === "paye" ? "paye" : null);

  useEffect(() => {
    let mounted = true;
    loadStripe(stripePublicKey).then((s) => {
      if (!mounted || !s || !cardMountRef.current) return;
      setStripe(s);
      const elements = s.elements();
      const card = elements.create("card", {
        style: { base: { fontSize: "14px", color: "#18181b", "::placeholder": { color: "#a1a1aa" } } },
      });
      card.mount(cardMountRef.current);
      card.on("ready", () => setCardReady(true));
      cardElementRef.current = card;
    });
    return () => {
      mounted = false;
      cardElementRef.current?.unmount();
    };
  }, [stripePublicKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !cardElementRef.current) return;
    setSubmitting(true);
    setError(null);

    const { token, error: tokenError } = await stripe.createToken(cardElementRef.current);
    if (tokenError || !token) {
      setError(tokenError?.message ?? "Carte refusée, vérifiez les informations saisies.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await payWithCardToken(sessionId, token.id);
      if (res.statut === "paye") {
        setResult("paye");
      } else if (res.statut === "requires_3ds") {
        setResult("requires_3ds");
      } else {
        setError(res.erreur || "Le paiement a échoué, veuillez réessayer.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result === "paye") {
    return (
      <div className="rounded-md bg-emerald-500/10 p-4 text-center">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Merci {guestPrenom}, votre paiement est confirmé !</p>
        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">Votre réservation est validée. À très bientôt.</p>
      </div>
    );
  }

  if (result === "requires_3ds") {
    return (
      <div className="rounded-md bg-amber-500/10 p-4 text-center">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Vérification supplémentaire demandée par votre banque</p>
        <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
          Contactez-nous directement pour finaliser ce paiement — votre banque nécessite une confirmation que nous devons traiter avec vous.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-[#71717a] dark:text-[#9a9aa0]">Carte bancaire</label>
        <div ref={cardMountRef} className="rounded-md border border-[#e5e5e5] px-3 py-3 dark:border-[#2a2a2d]" />
      </div>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={!cardReady || submitting}
        className="w-full rounded-md bg-[#18181b] py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50 dark:bg-white dark:text-[#18181b]"
      >
        {submitting ? "Paiement en cours..." : "Payer maintenant"}
      </button>
    </form>
  );
}
