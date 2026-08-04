import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { personnelAffectations, reservations, villas } from "@/db/schema";

// Applique la note donnée par le client (1 à 5) à TOUTE l'équipe (ménage + cuisine) affectée à
// son séjour le plus récent déjà terminé — pas de note par personne : impossible de démêler
// fiablement "5 pour la cuisinière, 2 pour le ménage" depuis un message WhatsApp en langage
// libre, donc la même note s'applique à qui a travaillé sur ce séjour. Retourne null si aucun
// séjour terminé n'est trouvé pour ce numéro (rien à noter).
export async function recordStayRating(phone: string, note: number): Promise<{ villaNom: string | null } | null> {
  const db = getDb();
  const [stay] = await db
    .select({ id: reservations.id, villaId: reservations.villaId })
    .from(reservations)
    .where(and(eq(reservations.guestPhone, phone), lte(reservations.checkOut, new Date())))
    .orderBy(desc(reservations.checkOut))
    .limit(1);
  if (!stay) return null;

  const updated = await db
    .update(personnelAffectations)
    .set({ note })
    .where(eq(personnelAffectations.reservationId, stay.id))
    .returning({ id: personnelAffectations.id });
  if (updated.length === 0) return null;

  const villa = stay.villaId ? (await db.select({ nom: villas.nom }).from(villas).where(eq(villas.id, stay.villaId)).limit(1))[0] : null;
  return { villaNom: villa?.nom ?? null };
}
