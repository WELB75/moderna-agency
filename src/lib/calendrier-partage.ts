import { createHmac, timingSafeEqual } from "node:crypto";

// Lien public "calendrier seul" d'un logement (/cal/[token]) — 2026-10-17 : un lien à part pour
// le propriétaire de Villa Wimiliim, avec uniquement la vue planning de SA villa (réservations et
// prix, le même calendrier que /calendrier), sans rien d'autre de l'app. Lecture seule.
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
