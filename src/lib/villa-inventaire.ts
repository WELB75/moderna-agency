import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villaInventairePieces } from "@/db/schema-inventaire-villa";

let tablePrete: Promise<void> | null = null;

export function assurerTableVillaInventaire(): Promise<void> {
  if (!tablePrete) {
    tablePrete = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS villa_inventaire_pieces (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          villa_id uuid NOT NULL,
          type text NOT NULL,
          libelle text NOT NULL,
          ordre integer NOT NULL DEFAULT 0,
          details jsonb NOT NULL DEFAULT '{}'::jsonb,
          observations text,
          photos jsonb NOT NULL DEFAULT '[]'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS villa_inventaire_pieces_villa_idx ON villa_inventaire_pieces (villa_id)`
      );
    })().catch((err) => {
      tablePrete = null;
      throw err;
    });
  }
  return tablePrete;
}

export async function getPiecesInventaire(villaId: string) {
  await assurerTableVillaInventaire();
  return getDb()
    .select()
    .from(villaInventairePieces)
    .where(eq(villaInventairePieces.villaId, villaId))
    .orderBy(asc(villaInventairePieces.ordre), asc(villaInventairePieces.libelle));
}

export type PieceInventaire = Awaited<ReturnType<typeof getPiecesInventaire>>[number];
