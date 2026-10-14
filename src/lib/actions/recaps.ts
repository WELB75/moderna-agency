"use server";

import { auth } from "@clerk/nextjs/server";
import { calculerPrixSejour, type PrixSejour } from "@/lib/pricelabs/sejour";
import { indisponibilites, type Indisponibilites } from "@/lib/disponibilite";

// Appelé par l'assistant "Nouvelle réservation" à l'étape Prix.
export async function calculerPrixSejourAction(villaId: string, checkIn: string, checkOut: string): Promise<PrixSejour> {
  await auth.protect();
  return calculerPrixSejour(String(villaId), String(checkIn).slice(0, 10), String(checkOut).slice(0, 10));
}

// Nuits déjà prises (réservations, Beds24 en direct, PriceLabs) sur les ~14 prochains mois,
// pour griser le calendrier de l'assistant.
export async function indisponibilitesAction(villaId: string): Promise<Indisponibilites> {
  await auth.protect();
  const debut = new Date();
  const fin = new Date();
  fin.setUTCDate(fin.getUTCDate() + 425);
  return indisponibilites(String(villaId), debut.toISOString().slice(0, 10), fin.toISOString().slice(0, 10));
}
