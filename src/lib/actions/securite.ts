"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations } from "@/db/schema";
import { getReservationSecurityData, getVillaSecurityData } from "@/lib/security-data";
import {
  ajouterAgentSecurite as ajouterAgentEnBase,
  envoyerSecuriteReservation,
  retirerAgentSecurite as retirerAgentEnBase,
  type ResultatEnvoiSecurite,
} from "@/lib/securite-agents";
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

// Bouton « Envoyer à la sécurité » : envoi forcé du modèle Meta à tous les agents du domaine,
// même si la fiche police n'est pas complète (Kamel, 2026-11-06 : 11 passeports sur 12 reçus,
// « c'est suffisant »). Marque la réservation comme notifiée pour que l'envoi automatique ne
// reparte pas en double quand la fiche se complétera.
export async function envoyerSecuriteManuel(
  reservationId: string
): Promise<{ resultats: ResultatEnvoiSecurite[]; erreur?: string }> {
  await auth.protect();
  const res = await envoyerSecuriteReservation(reservationId, "manuel");
  if (res.resultats.some((r) => r.ok)) {
    const maintenant = new Date();
    await getDb()
      .update(reservations)
      .set({ securiteNotifieeAt: maintenant, messageSecuriteEnvoyeAt: maintenant })
      .where(eq(reservations.id, reservationId));
  }
  revalidatePath("/securite");
  revalidatePath("/dashboard");
  return res;
}

export async function ajouterAgentSecurite(domaineId: string, nom: string, phone: string): Promise<void> {
  await auth.protect();
  const n = nom.trim();
  const p = phone.trim();
  if (!n || p.replace(/\D/g, "").length < 9) throw new Error("Nom et numéro WhatsApp requis.");
  await ajouterAgentEnBase(domaineId, n, p);
  revalidatePath("/securite");
}

export async function retirerAgentSecurite(agent: { id: string | null; domaineId: string }): Promise<void> {
  await auth.protect();
  await retirerAgentEnBase(agent);
  revalidatePath("/securite");
}
