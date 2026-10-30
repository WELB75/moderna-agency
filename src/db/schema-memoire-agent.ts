import { pgTable, uuid, text, timestamp, integer, boolean, bigint, bigserial, jsonb } from "drizzle-orm/pg-core";

// Mémoire de l'agent IA de la boîte de réception (voir src/lib/messages-agent/memoire.ts).
// Trois niveaux : fils lus (agent_memoire_fils), échanges extraits et anonymisés
// (agent_memoire_brut), puis fiches consolidées utilisées par l'agent (agent_memoire_fiches).
// Tables créées à la volée (assurerTablesMemoire) : pas de migration à lancer sur Neon.

export const agentMemoireFils = pgTable("agent_memoire_fils", {
  bookingId: bigint("booking_id", { mode: "number" }).primaryKey(),
  villaNom: text("villa_nom"),
  canal: text("canal"),
  nbMessages: integer("nb_messages").default(0).notNull(),
  statut: text("statut").default("analyse").notNull(), // "analyse" | "vide" | "erreur"
  analyseAt: timestamp("analyse_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentMemoireBrut = pgTable("agent_memoire_brut", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: bigint("booking_id", { mode: "number" }).notNull(),
  theme: text("theme").notNull(),
  question: text("question").notNull(),
  reponse: text("reponse").notNull(),
  villaNom: text("villa_nom"), // renseigné seulement si la réponse est propre à ce logement
  canal: text("canal"),
  dateEchange: timestamp("date_echange", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentMemoireFiches = pgTable("agent_memoire_fiches", {
  id: uuid("id").defaultRandom().primaryKey(),
  theme: text("theme").notNull(),
  titre: text("titre").notNull(),
  question: text("question").notNull(),
  reponse: text("reponse").notNull(),
  villaNom: text("villa_nom"), // null = tous les logements
  actif: boolean("actif").default(true).notNull(),
  // Fiche écrite ou corrigée à la main : la consolidation automatique n'y touche plus.
  epingle: boolean("epingle").default(false).notNull(),
  nbSources: integer("nb_sources").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentMemoireThemes = pgTable("agent_memoire_themes", {
  theme: text("theme").primaryKey(),
  consolideAt: timestamp("consolide_at", { withTimezone: true }).notNull(),
});

// Codes (wifi, boîtier, porte) retrouvés dans les messages et proposés à l'équipe : jamais
// appliqués tout seuls sur la fiche du logement.
export const agentMemoireCodes = pgTable("agent_memoire_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaNom: text("villa_nom").notNull(),
  type: text("type").notNull(), // "wifi" | "boitier" | "porte"
  valeur: text("valeur").notNull(),
  bookingId: bigint("booking_id", { mode: "number" }),
  statut: text("statut").default("propose").notNull(), // "propose" | "applique" | "ignore"
  vuAt: timestamp("vu_at", { withTimezone: true }).defaultNow().notNull(),
});

// Historique de conversations importé depuis un export de la messagerie SuperHote (jsonl : plateforme,
// logement, dates, messages). Les messages attendent ici d'être analysés ; une fois la conversation
// traitée ils sont vidés (seuls les échanges anonymisés restent dans agent_memoire_brut).
export const agentMemoireImport = pgTable("agent_memoire_import", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  cle: text("cle").notNull().unique(), // empreinte de la conversation : évite un double import
  plateforme: text("plateforme").notNull(),
  logement: text("logement"),
  dateDebut: text("date_debut"), // "AAAA-MM-JJ" ou "AAAA-MM-JJ/AAAA-MM-JJ"
  langue: text("langue"),
  messages: jsonb("messages").$type<{ auteur: string; date: string; texte: string }[]>().notNull(),
  traite: boolean("traite").default(false).notNull(),
});
