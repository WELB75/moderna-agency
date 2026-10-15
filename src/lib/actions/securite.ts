"use server";

import { auth } from "@clerk/nextjs/server";
import { getReservationSecurityData, getVillaSecurityData } from "@/lib/security-data";
import type { VillaSecurityData } from "@/components/app/villa-security-block";

// Détail d'un logement (pièces d'identité, fiche police imprimable) chargé seulement quand on le
// déplie sur la page Sécurité : les photos sont stockées en data URL, les charger d'avance pour
// les 16 logements alourdirait fortement la page. Séjour du jour s'il y en a un (jamais les
// occupants d'un autre séjour), sinon la dernière fiche connue du logement.
export async function chargerSecuriteLogement(
  villaId: string,
  reservationId: string | null
): Promise<VillaSecurityData | null> {
  await auth.protect();
  return reservationId ? getReservationSecurityData(reservationId) : getVillaSecurityData(villaId);
}
