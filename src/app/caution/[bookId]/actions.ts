"use server";

import { redirect } from "next/navigation";
import { creerSessionCaution } from "@/lib/caution/service";
import { stripeConfigure } from "@/lib/caution/stripe";

// Action PUBLIQUE (le voyageur n'a pas de compte) : elle ne reçoit que le numéro de réservation,
// re-vérifie côté serveur que la caution est bien demandable, et ne fait que créer une session de
// paiement Stripe pour ce montant-là (fixé par l'app, jamais par le navigateur).
export async function demarrerCaution(beds24BookingId: string, lang: "fr" | "en") {
  const chemin = `/caution/${encodeURIComponent(beds24BookingId)}`;
  const suffixe = lang === "en" ? "&lang=en" : "";
  if (!stripeConfigure()) redirect(`${chemin}?retour=erreur${suffixe}`);

  let url: string;
  try {
    url = await creerSessionCaution(beds24BookingId);
  } catch (err) {
    console.error("Caution : création de la session Stripe impossible", err);
    redirect(`${chemin}?retour=erreur${suffixe}`);
  }
  redirect(url);
}
