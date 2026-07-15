import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cashEntryTypeEnum = pgEnum("cash_entry_type", [
  "remise", // argent confié par le propriétaire/client
  "depense", // dépense effectuée
  "restitution", // argent rendu
]);

export const checklistTypeEnum = pgEnum("checklist_type", [
  "entree", // état des lieux d'entrée (check-in)
  "sortie", // état des lieux de sortie (check-out)
]);

export const checklistStatusEnum = pgEnum("checklist_status", [
  "brouillon",
  "signe",
]);

export const itemStatusEnum = pgEnum("item_status", [
  "non_verifie",
  "ok",
  "probleme",
]);

export const procedureTypeEnum = pgEnum("procedure_type", [
  "checkin",
  "checkout",
  "menage",
  "incident",
]);

export const tacheStatutEnum = pgEnum("tache_statut", [
  "en_attente",
  "en_cours",
  "termine",
]);

export const domaines = pgTable("domaines", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const logementTypeEnum = pgEnum("logement_type", ["villa", "appartement"]);

export const villas = pgTable("villas", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: logementTypeEnum("type").default("villa").notNull(),
  domaineId: uuid("domaine_id").references(() => domaines.id, { onDelete: "set null" }),
  numero: text("numero").notNull(), // numéro de la villa / de l'appartement
  nom: text("nom").notNull(), // nom de la villa / de l'appartement
  adresse: text("adresse"),
  notes: text("notes"),
  description: text("description"),
  codeBoitier: text("code_boitier"), // code de la boîte à clés / digicode d'accès
  icalUrl: text("ical_url"), // lien iCal Superhote pour synchroniser les réservations de cette villa
  photoUrl: text("photo_url"),
  galleryUrls: jsonb("gallery_urls").$type<string[]>().default([]),
  superhoteListingId: text("superhote_listing_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    superhoteBookingId: text("superhote_booking_id"),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone"),
    guestEmail: text("guest_email"),
    checkIn: timestamp("check_in", { withTimezone: true }).notNull(),
    checkOut: timestamp("check_out", { withTimezone: true }).notNull(),
    guestsCount: integer("guests_count"),
    nbAdultes: integer("nb_adultes"), // pour la fiche gendarmerie (adultes uniquement)
    nbEnfants: integer("nb_enfants"),
    status: text("status").default("confirmee").notNull(),
    source: text("source").default("manuel").notNull(), // "superhote" | "manuel"
    canal: text("canal"), // canal de réservation : Direct, Airbnb.com, Booking.com...
    notes: text("notes"), // demandes particulières (ex. prévoir une cuisinière)
    rawData: jsonb("raw_data"),
    loyerTotal: numeric("loyer_total", { precision: 10, scale: 2 }),
    montantPaye: numeric("montant_paye", { precision: 10, scale: 2 }),
    caution: numeric("caution", { precision: 10, scale: 2 }),
    devisePaiement: text("devise_paiement").default("EUR").notNull(), // devise du loyer/caution (EUR, DH...)
    cautionPayee: boolean("caution_payee").default(false).notNull(),
    moyenPaiement: text("moyen_paiement"),
    notesPaiement: text("notes_paiement"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("reservations_superhote_booking_id_idx").on(t.superhoteBookingId)]
);

export const cashEntries = pgTable("cash_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
  reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  type: cashEntryTypeEnum("type").notNull(),
  montant: numeric("montant", { precision: 10, scale: 2 }).notNull(),
  devise: text("devise").default("MAD").notNull(),
  description: text("description"),
  responsable: text("responsable"), // personne qui a remis/dépensé l'argent (ex. Brahim Jardinier)
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const checklistItemTemplates = pgTable("checklist_item_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
  categorie: text("categorie").notNull(),
  libelle: text("libelle").notNull(),
  ordre: integer("ordre").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inventoryChecklists = pgTable("inventory_checklists", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }).notNull(),
  reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  type: checklistTypeEnum("type").notNull(),
  status: checklistStatusEnum("status").default("brouillon").notNull(),
  clientNom: text("client_nom"),
  clientSignatureUrl: text("client_signature_url"),
  agentNom: text("agent_nom"),
  agentSignatureUrl: text("agent_signature_url"),
  agentUserId: text("agent_user_id"),
  notesGenerales: text("notes_generales"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  checklistId: uuid("checklist_id").references(() => inventoryChecklists.id, { onDelete: "cascade" }).notNull(),
  categorie: text("categorie").notNull(),
  libelle: text("libelle").notNull(),
  status: itemStatusEnum("status").default("non_verifie").notNull(),
  commentaire: text("commentaire"),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  ordre: integer("ordre").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const maintenanceRecords = pgTable("maintenance_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }).notNull(),
  categorie: text("categorie").notNull(),
  equipement: text("equipement").notNull(),
  dateIntervention: timestamp("date_intervention", { withTimezone: true }).notNull(),
  prochaineDatePrevue: timestamp("prochaine_date_prevue", { withTimezone: true }),
  prestataire: text("prestataire"),
  cout: numeric("cout", { precision: 10, scale: 2 }),
  notes: text("notes"),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const procedureTemplates = pgTable("procedure_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: procedureTypeEnum("type").notNull(),
  titre: text("titre").notNull(),
  description: text("description"),
  etapes: jsonb("etapes").$type<string[]>().default([]).notNull(),
  ordre: integer("ordre").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taches = pgTable("taches", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }).notNull(),
  titre: text("titre").notNull(),
  description: text("description"),
  statut: tacheStatutEnum("statut").default("en_attente").notNull(),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dailyTasks = pgTable("daily_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  titre: text("titre").notNull(),
  fait: boolean("fait").default(false).notNull(),
  ordre: integer("ordre").default(0).notNull(),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const technicians = pgTable("technicians", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: text("nom").notNull(),
  fonction: text("fonction").notNull(),
  telephone: text("telephone").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const superhoteSyncLog = pgTable("superhote_sync_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  success: boolean("success"),
  bookingsSynced: integer("bookings_synced").default(0),
  errorMessage: text("error_message"),
});
