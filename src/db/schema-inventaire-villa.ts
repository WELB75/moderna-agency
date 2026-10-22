import { pgTable, uuid, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// Inventaire de référence d'une villa (2026-10-22, fiche papier « Fiche d'inventaire - Villa »
// remplie sur place pour la Villa Nessya, à refaire pour toutes les villas) : une ligne par pièce
// ou zone (chambre, salle de bain, cuisine, linge...). Distinct des états des lieux entrée/sortie
// (inventory_checklists), qui sont liés à une réservation : ici on décrit ce que la villa contient
// et dans quel état, une fois, pour pouvoir comparer ensuite.
//
// `details` garde les réponses de la fiche, selon le modèle du type de pièce (voir
// src/lib/villa-inventaire-modeles.ts). `photos` : { url, legende }[].
//
// Table créée à la volée (assurerTableVillaInventaire) : pas de migration à lancer sur Neon.
export const villaInventairePieces = pgTable("villa_inventaire_pieces", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").notNull(),
  type: text("type").$type<"chambre" | "salle_de_bain" | "zone">().notNull(),
  libelle: text("libelle").notNull(), // « Chambre 1 », « Cuisine »...
  ordre: integer("ordre").default(0).notNull(),
  details: jsonb("details").$type<Record<string, Record<string, ReponseLigne>>>().default({}).notNull(),
  observations: text("observations"),
  photos: jsonb("photos").$type<{ url: string; legende: string }[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// choix : cases cochées (plusieurs possibles, ex. « Bon état » + « Fonctionne ») ; qte : linge.
export type ReponseLigne = { choix?: string[]; qte?: number | null };
