"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { villaInventairePieces, type ReponseLigne } from "@/db/schema-inventaire-villa";
import { assurerTableVillaInventaire } from "@/lib/villa-inventaire";

type TypePiece = "chambre" | "salle_de_bain" | "zone";

const TYPES: TypePiece[] = ["chambre", "salle_de_bain", "zone"];

export async function ajouterPieceInventaire(villaId: string, type: string, libelle: string) {
  await auth.protect();
  const nom = libelle.trim();
  if (!villaId || !nom || !TYPES.includes(type as TypePiece)) throw new Error("Type et nom de la pièce obligatoires.");
  await assurerTableVillaInventaire();
  const db = getDb();
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${villaInventairePieces.ordre}), 0)` })
    .from(villaInventairePieces)
    .where(eq(villaInventairePieces.villaId, villaId));
  await db.insert(villaInventairePieces).values({ villaId, type: type as TypePiece, libelle: nom, ordre: Number(max) + 1 });
  revalidatePath(`/villas/${villaId}/inventaire`);
}

export async function enregistrerPieceInventaire(
  pieceId: string,
  villaId: string,
  details: Record<string, Record<string, ReponseLigne>>,
  observations: string
) {
  await auth.protect();
  await assurerTableVillaInventaire();
  await getDb()
    .update(villaInventairePieces)
    .set({ details, observations: observations.trim() || null, updatedAt: new Date() })
    .where(and(eq(villaInventairePieces.id, pieceId), eq(villaInventairePieces.villaId, villaId)));
  revalidatePath(`/villas/${villaId}/inventaire`);
}

export async function renommerPieceInventaire(pieceId: string, villaId: string, libelle: string) {
  await auth.protect();
  const nom = libelle.trim();
  if (!nom) throw new Error("Nom obligatoire.");
  await getDb()
    .update(villaInventairePieces)
    .set({ libelle: nom, updatedAt: new Date() })
    .where(and(eq(villaInventairePieces.id, pieceId), eq(villaInventairePieces.villaId, villaId)));
  revalidatePath(`/villas/${villaId}/inventaire`);
}

export async function supprimerPieceInventaire(pieceId: string, villaId: string) {
  await auth.protect();
  await getDb()
    .delete(villaInventairePieces)
    .where(and(eq(villaInventairePieces.id, pieceId), eq(villaInventairePieces.villaId, villaId)));
  revalidatePath(`/villas/${villaId}/inventaire`);
}

export async function ajouterPhotoPieceInventaire(pieceId: string, villaId: string, url: string, legende: string) {
  await auth.protect();
  await getDb().execute(sql`
    UPDATE villa_inventaire_pieces
    SET photos = photos || ${JSON.stringify([{ url, legende: legende.trim() }])}::jsonb, updated_at = now()
    WHERE id = ${pieceId} AND villa_id = ${villaId}
  `);
  revalidatePath(`/villas/${villaId}/inventaire`);
}

export async function retirerPhotoPieceInventaire(pieceId: string, villaId: string, url: string) {
  await auth.protect();
  await getDb().execute(sql`
    UPDATE villa_inventaire_pieces
    SET photos = coalesce((SELECT jsonb_agg(p) FROM jsonb_array_elements(photos) p WHERE p->>'url' <> ${url}), '[]'::jsonb),
        updated_at = now()
    WHERE id = ${pieceId} AND villa_id = ${villaId}
  `);
  revalidatePath(`/villas/${villaId}/inventaire`);
}
