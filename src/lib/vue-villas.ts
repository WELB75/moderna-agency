import { currentUser } from "@clerk/nextjs/server";
import { sql, type SQL } from "drizzle-orm";
import { villas } from "@/db/schema";
import { normaliserEmail } from "@/lib/acces";

// Kamel, 2026-11-05 : « les appartements, moi je les veux pas, pour espace Kamel et espace Mohamed
// tu gardes que les villas ». Pour ces deux comptes, accueil (échéances), calendrier et messages ne
// montrent que les villas ; les autres comptes (Fouad, Imad, Imane, Sanaa...) voient tout comme avant.
const COMPTES_VILLAS_SEULEMENT = ["tmshparis@gmail.com", "grandeclasse89@gmail.com"];

export async function villasSeulement(): Promise<boolean> {
  try {
    const user = await currentUser();
    const emails = (user?.emailAddresses ?? []).map((e) => normaliserEmail(e.emailAddress));
    return emails.some((e) => COMPTES_VILLAS_SEULEMENT.includes(e));
  } catch {
    return false;
  }
}

// Condition SQL « ce n'est pas un appartement » (les lignes sans logement restent, d'où IS DISTINCT FROM).
export function sansAppartements(actif: boolean): SQL | undefined {
  return actif ? sql`${villas.type} is distinct from 'appartement'` : undefined;
}
