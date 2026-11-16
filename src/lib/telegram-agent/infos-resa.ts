import { inArray, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservations, villas } from "@/db/schema";
import { logementTexte, revenusTexte } from "@/lib/revenus-plateforme";

// Infos ajoutées à chaque réservation citée dans un message Telegram : le logement (appartement :
// immeuble, adresse, chambres) et le détail des revenus Airbnb / Booking.com. Jamais envoyé au
// personnel par WhatsApp : les montants restent côté Telegram (Kamel et Fouad).

export type InfosResa = { logement: string | null; revenus: string | null };

export async function infosReservations(ids: string[]): Promise<Map<string, InfosResa>> {
  const out = new Map<string, InfosResa>();
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return out;
  try {
    const rows = await getDb()
      .select({
        id: reservations.id,
        rawData: reservations.rawData,
        loyerTotal: reservations.loyerTotal,
        fraisMenage: reservations.fraisMenage,
        canal: reservations.canal,
        devise: reservations.devisePaiement,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        type: villas.type,
        adresse: villas.adresse,
        numeroImmeuble: villas.numeroImmeuble,
        nbChambres: villas.nbChambres,
      })
      .from(reservations)
      .leftJoin(villas, eq(reservations.villaId, villas.id))
      .where(inArray(reservations.id, uniques));
    for (const r of rows) out.set(r.id, { logement: logementTexte(r), revenus: revenusTexte(r) });
  } catch (err) {
    // Un détail manquant ne doit jamais empêcher un rappel ou une notification de partir.
    console.error("Infos réservation Telegram indisponibles:", err);
  }
  return out;
}

export function lignesInfos(infos: InfosResa | undefined, indent = "  "): string[] {
  if (!infos) return [];
  return [infos.logement ? `${indent}Logement : ${infos.logement}` : null, infos.revenus ? `${indent}${infos.revenus}` : null].filter((l): l is string => l !== null);
}
