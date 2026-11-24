import { pgTable, uuid, text, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { villas } from "./schema";

// Notes de suivi par logement (Kamel, 2026-11-24 : "pour chaque villa qu'il puisse créer des notes
// sur l'état du logement, les travaux, les aléas, les cautions et argent pris de client, les
// demandes spécifiques [...] et classifie par catégories distinctes"). Alimentée par l'agent
// Telegram (vocaux transcrits) et par la page Notes de l'app. Ce n'est PAS de la comptabilité : un
// montant noté ici n'écrit rien dans la caisse.
export const villaNotes = pgTable(
  "villa_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Nullable : une note générale qui ne concerne aucun logement précis reste possible.
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    // Clé de lib/notes-villa.ts (etat_logement, travaux, aleas, argent, demande, general).
    categorie: text("categorie").notNull().default("general"),
    texte: text("texte").notNull(),
    // Montant mentionné (caution, argent pris au client...), purement informatif.
    montant: numeric("montant", { precision: 10, scale: 2 }),
    devise: text("devise"),
    auteurNom: text("auteur_nom").notNull(),
    auteurId: text("auteur_id"),
    source: text("source").notNull().default("app"), // "app" | "telegram"
    vocal: boolean("vocal").notNull().default(false), // dicté en message vocal
    resolu: boolean("resolu").notNull().default(false), // travaux faits, aléa réglé...
    resoluAt: timestamp("resolu_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("villa_notes_villa_idx").on(t.villaId, t.createdAt), index("villa_notes_categorie_idx").on(t.categorie)]
);
