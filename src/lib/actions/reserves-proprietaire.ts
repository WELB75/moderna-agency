"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { interventions } from "@/db/schema";
import { villaDuCalendrierToken } from "@/lib/calendrier-partage";
import { notifyStaffWhatsApp } from "@/lib/whatsapp";

// Réserves du propriétaire depuis son lien calendrier (/cal/[token]) — Kamel, 2026-11-16 : "le
// propriétaire note ses réserves [...] et après, nous, on coche et ça part". Une réserve est une
// intervention d'origine "proprietaire" à l'étape "signale" : rien ne part vers un technicien
// tant que l'équipe ne l'a pas décidé. Pas de connexion Clerk : la portée est limitée au
// logement que le jeton désigne, revérifié à chaque appel (jamais un identifiant du navigateur).
type Resultat = { ok: true } | { ok: false; erreur: string };

export async function ajouterReserveProprietaire(token: string, texte: string): Promise<Resultat> {
  const villa = await villaDuCalendrierToken(token);
  if (!villa) return { ok: false, erreur: "Lien invalide." };
  const titre = texte.trim().replace(/\s+/g, " ");
  if (!titre) return { ok: false, erreur: "Écrivez la réserve." };
  if (titre.length > 200) return { ok: false, erreur: "Trop long (200 caractères maximum)." };

  await getDb().insert(interventions).values({
    titre,
    villaId: villa.id,
    origine: "proprietaire",
    createdByName: "Propriétaire",
  });

  try {
    await notifyStaffWhatsApp(`Nouvelle réserve du propriétaire — ${villa.nom} : "${titre}".`);
  } catch (err) {
    console.error("Notification réserve propriétaire:", err);
  }

  revalidatePath(`/cal/${token}`);
  revalidatePath("/interventions");
  revalidatePath("/maintenance");
  return { ok: true };
}
