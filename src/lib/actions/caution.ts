"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { auteurConnecte } from "@/lib/journal";
import { libererCaution, prelever } from "@/lib/caution/service";
import { stripeConfigure } from "@/lib/caution/stripe";
import { enCentimes } from "@/lib/caution/regles";

// Actions de l'équipe sur l'empreinte Stripe d'une réservation (fiche réservation).
// Le contrôle d'équipe est fait par proxy.ts ; auth.protect() double la vérification.

export async function libererEmpreinte(reservationId: string): Promise<void> {
  await auth.protect();
  if (!stripeConfigure()) throw new Error("Stripe n'est pas configuré.");
  await libererCaution(reservationId, await auteurConnecte());
  revalidatePath(`/reservations/${reservationId}`);
}

export async function prelevementCaution(reservationId: string, montantEuros: string): Promise<void> {
  await auth.protect();
  if (!stripeConfigure()) throw new Error("Stripe n'est pas configuré.");
  const centimes = enCentimes(montantEuros.replace(",", "."));
  if (!centimes) throw new Error("Montant invalide.");
  await prelever(reservationId, centimes, await auteurConnecte());
  revalidatePath(`/reservations/${reservationId}`);
}
