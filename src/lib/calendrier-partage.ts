import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { villas } from "@/db/schema";

// Lien public "calendrier seul" d'un logement (/cal/[token]) — 2026-10-17 : un lien à part pour
// le propriétaire de Villa Wimiliim, avec uniquement la vue planning de SA villa (réservations et
// prix, le même calendrier que /calendrier), sans rien d'autre de l'app. Lecture seule, sauf la
// réservation de ses propres dates (séjour propriétaire, voir actions/calendrier-proprietaire.ts).
//
// Le jeton est dérivé par HMAC du jeton du lien propriétaire (villas.lienProprietaireToken, UUID
// aléatoire) : pas de nouvelle colonne en base, impossible de remonter au lien propriétaire
// /p/[token] depuis ce lien (qui, lui, permet d'ajouter des demandes de travaux), et le bouton
// "Régénérer le lien propriétaire" invalide aussi ce lien calendrier.
export function calendrierToken(lienProprietaireToken: string): string {
  return createHmac("sha256", lienProprietaireToken).update("calendrier-seul").digest("base64url").slice(0, 24);
}

export function calendrierTokenValide(attendu: string, recu: string): boolean {
  const a = Buffer.from(attendu);
  const b = Buffer.from(recu);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Logement désigné par un jeton de lien calendrier — null si le jeton ne correspond à aucun.
// Vérifié à chaque appel (page ET chaque action serveur), jamais un identifiant fourni par le
// navigateur : une Server Action reste appelable directement sans repasser par la page.
export async function villaDuCalendrierToken(token: string | null | undefined) {
  if (!token || token.length !== 24) return null;
  const candidats = await getDb()
    .select({
      id: villas.id,
      nom: villas.nom,
      proprietaireNom: villas.proprietaireNom,
      beds24RoomId: villas.beds24RoomId,
      lienProprietaireToken: villas.lienProprietaireToken,
    })
    .from(villas);
  const villa = candidats.find((v) => calendrierTokenValide(calendrierToken(v.lienProprietaireToken), token));
  if (!villa) return null;
  return { id: villa.id, nom: villa.nom, proprietaireNom: villa.proprietaireNom, beds24RoomId: villa.beds24RoomId };
}

// Libellé des séjours propriétaire : le même que l'assistant "Nouvelle réservation" (type
// "Propriétaire", voir LIBELLES_TYPE dans actions/reservations.ts) — affiché en jaune "Blocage"
// partout, sans ménage automatique ni loyer.
export const CANAL_SEJOUR_PROPRIETAIRE = "Blocage · Propriétaire";
