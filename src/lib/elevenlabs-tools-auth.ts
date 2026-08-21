import type { NextRequest } from "next/server";

// Vérif du secret partagé pour les 3 routes /api/elevenlabs/* (Server Tools appelés par l'agent
// vocal ElevenLabs — Jamila) — même principe que isAuthorized dans
// src/app/api/staff-requests/sweep/route.ts, mais volontairement fail-closed (secret absent =
// refusé) plutôt que fail-open : contrairement au cron sweep, ces routes peuvent écrire une vraie
// réservation, pas question de les laisser ouvertes si la variable d'env n'est pas configurée.
export function isAuthorizedElevenLabsTool(req: NextRequest): boolean {
  const secret = process.env.ELEVENLABS_TOOLS_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
