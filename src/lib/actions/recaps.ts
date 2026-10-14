"use server";

import { auth } from "@clerk/nextjs/server";
import { calculerPrixSejour, type PrixSejour } from "@/lib/pricelabs/sejour";

// Appelé par l'assistant "Nouvelle réservation" à l'étape Prix.
export async function calculerPrixSejourAction(villaId: string, checkIn: string, checkOut: string): Promise<PrixSejour> {
  await auth.protect();
  return calculerPrixSejour(String(villaId), String(checkIn).slice(0, 10), String(checkOut).slice(0, 10));
}
