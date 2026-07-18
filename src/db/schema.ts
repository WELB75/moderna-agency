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
  mapsUrl: text("maps_url"), // lien Google Maps partageable (localisation du domaine)
  estBase: boolean("est_base").default(false).notNull(), // entrepôt central (ex. Bureau Moderna Agency) : source des transferts de stock
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
  numeroImmeuble: text("numero_immeuble"), // numéro de l'immeuble/résidence, surtout pour les appartements
  notes: text("notes"),
  description: text("description"),
  codeBoitier: text("code_boitier"), // code de la boîte à clés / digicode d'accès
  proprietaireNom: text("proprietaire_nom"),
  proprietaireTelephone: text("proprietaire_telephone"),
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

export const moyenPaiementCaisseEnum = pgEnum("moyen_paiement_caisse", ["especes", "virement", "carte"]);

export const cashEntries = pgTable("cash_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
  reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  type: cashEntryTypeEnum("type").notNull(),
  moyenPaiement: moyenPaiementCaisseEnum("moyen_paiement").default("especes").notNull(),
  montant: numeric("montant", { precision: 10, scale: 2 }).notNull(),
  devise: text("devise").default("MAD").notNull(),
  description: text("description"),
  responsable: text("responsable"), // personne qui a remis/dépensé l'argent (ex. Brahim Jardinier)
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
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

export const interventionEtapeEnum = pgEnum("intervention_etape", [
  "signale",
  "contacte",
  "planifie",
  "en_cours",
  "termine",
]);

export const interventions = pgTable("interventions", {
  id: uuid("id").defaultRandom().primaryKey(),
  titre: text("titre").notNull(),
  probleme: text("probleme"),
  lieu: text("lieu"), // texte libre (ex. "Résidence Noria") quand ce n'est pas une villa précise
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
  domaineId: uuid("domaine_id").references(() => domaines.id, { onDelete: "set null" }),
  prestataire: text("prestataire"),
  etape: interventionEtapeEnum("etape").default("signale").notNull(),
  notes: text("notes"),
  attachmentUrls: jsonb("attachment_urls").$type<string[]>().default([]),
  signaleAt: timestamp("signale_at", { withTimezone: true }).defaultNow().notNull(),
  contacteAt: timestamp("contacte_at", { withTimezone: true }),
  planifieAt: timestamp("planifie_at", { withTimezone: true }),
  debutAt: timestamp("debut_at", { withTimezone: true }),
  finAt: timestamp("fin_at", { withTimezone: true }),
  // Validation du patron : accepte / refuse via le lien public, sans connexion.
  validationStatut: text("validation_statut"), // null | "accepte" | "refuse"
  validationNote: text("validation_note"),
  validationAt: timestamp("validation_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gendarmerieForms = pgTable("gendarmerie_forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "cascade" }),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
  statut: text("statut").default("en_attente").notNull(), // en_attente | complete
  langue: text("langue"), // langue choisie par le client au remplissage
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const gendarmerieOccupants = pgTable("gendarmerie_occupants", {
  id: uuid("id").defaultRandom().primaryKey(),
  formId: uuid("form_id").references(() => gendarmerieForms.id, { onDelete: "cascade" }).notNull(),
  nom: text("nom"),
  prenom: text("prenom"),
  dateNaissance: text("date_naissance"),
  lieuNaissance: text("lieu_naissance"),
  nationalite: text("nationalite"),
  profession: text("profession"),
  venantDe: text("venant_de"),
  allantA: text("allant_a"),
  dateArrivee: text("date_arrivee"),
  domicileHabituel: text("domicile_habituel"),
  typePiece: text("type_piece"),
  numeroPiece: text("numero_piece"),
  datePiece: text("date_piece"),
  lieuPiece: text("lieu_piece"),
  signatureNom: text("signature_nom"), // nom tapé pour valoir signature
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nom: text("nom").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_nom_idx").on(t.nom)]
);

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  photoUrl: text("photo_url").notNull(),
  domaineId: uuid("domaine_id").references(() => domaines.id, { onDelete: "set null" }),
  montant: numeric("montant", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id").references(() => receipts.id, { onDelete: "cascade" }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  quantite: integer("quantite").notNull(),
});

export const domaineStock = pgTable(
  "domaine_stock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domaineId: uuid("domaine_id").references(() => domaines.id, { onDelete: "cascade" }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    quantite: integer("quantite").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("domaine_stock_domaine_product_idx").on(t.domaineId, t.productId)]
);

export const villaStock = pgTable(
  "villa_stock",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    quantite: integer("quantite").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("villa_stock_villa_product_idx").on(t.villaId, t.productId)]
);

export const superhoteSyncLog = pgTable("superhote_sync_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  success: boolean("success"),
  bookingsSynced: integer("bookings_synced").default(0),
  errorMessage: text("error_message"),
});
