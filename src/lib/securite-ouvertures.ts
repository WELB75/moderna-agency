import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// Preuve que le gardien a vraiment ouvert le lien du message sécurité (Kamel, 2026-11-06 : l'accusé
// « Lu » de WhatsApp ne vient jamais si le gardien a désactivé ses confirmations de lecture, alors
// que le message est bien arrivé). Une ligne par réservation : première et dernière ouverture.
// Ne comptent pas : l'aperçu automatique de WhatsApp (robot qui télécharge le lien à l'envoi) et
// l'équipe connectée à l'app (Kamel qui clique « Vérifier le lien »).

export type OuvertureSecurite = { premiere: Date; derniere: Date; nombre: number };

let tablePrete: Promise<void> | null = null;

function assurerTable(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      await getDb().execute(sql`
        CREATE TABLE IF NOT EXISTS securite_ouvertures (
          reservation_id uuid PRIMARY KEY,
          premiere_at timestamptz NOT NULL DEFAULT now(),
          derniere_at timestamptz NOT NULL DEFAULT now(),
          nombre integer NOT NULL DEFAULT 1
        )
      `);
    })().catch((e) => {
      tablePrete = null;
      throw e;
    });
  }
  return tablePrete;
}

const RE_ROBOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|curl|wget|headless|vercel/i;

// À appeler depuis la page publique du gardien. Ne lève jamais d'erreur : un souci d'enregistrement
// ne doit pas empêcher le gardien de voir les passeports.
export async function enregistrerOuvertureSecurite(reservationId: string): Promise<void> {
  try {
    const h = await headers();
    if (RE_ROBOT.test(h.get("user-agent") ?? "")) return;
    const { userId } = await auth();
    if (userId) return;
    await assurerTable();
    await getDb().execute(sql`
      INSERT INTO securite_ouvertures (reservation_id) VALUES (${reservationId})
      ON CONFLICT (reservation_id) DO UPDATE SET derniere_at = now(), nombre = securite_ouvertures.nombre + 1
    `);
  } catch {
    // volontairement ignoré
  }
}

export async function getOuvertures(reservationIds: string[]): Promise<Map<string, OuvertureSecurite>> {
  const resultat = new Map<string, OuvertureSecurite>();
  if (reservationIds.length === 0) return resultat;
  try {
    await assurerTable();
    const lignes = await getDb().execute(sql`
      SELECT reservation_id, premiere_at, derniere_at, nombre FROM securite_ouvertures
      WHERE reservation_id IN (${sql.join(reservationIds.map((id) => sql`${id}::uuid`), sql`, `)})
    `);
    const rows = ((lignes as unknown as { rows?: Record<string, unknown>[] }).rows ?? (lignes as unknown as Record<string, unknown>[])) as Record<string, unknown>[];
    for (const r of rows) {
      resultat.set(String(r.reservation_id), {
        premiere: new Date(String(r.premiere_at)),
        derniere: new Date(String(r.derniere_at)),
        nombre: Number(r.nombre),
      });
    }
  } catch {
    // table indisponible : on affiche simplement « pas encore ouvert »
  }
  return resultat;
}
