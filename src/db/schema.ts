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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Devis } from "@/lib/devis-types";

export const cashEntryTypeEnum = pgEnum("cash_entry_type", [
  "remise", // argent confié par la société (Imed) pour les dépenses courantes
  "loyer", // loyer reçu directement d'un client (avance/solde de réservation) — à part de la remise société
  "extra", // recette annexe reçue d'un client (petit-déj, options...) — ni loyer, ni argent société
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

export const interventionUrgenceEnum = pgEnum("intervention_urgence", [
  "basse",
  "normale",
  "haute",
  "critique",
]);

export const interventionCategorieEnum = pgEnum("intervention_categorie", [
  "electricite",
  "plomberie",
  "climatisation",
  "carrelage_sol",
  "mobilier",
  "vitres_fenetres",
  "peinture_murs",
  "exterieur_jardin",
  "internet_domotique",
  "proprete",
  "autre",
]);

export const domaines = pgTable("domaines", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: text("nom").notNull(),
  adresse: text("adresse"),
  mapsUrl: text("maps_url"), // lien Google Maps partageable (localisation du domaine)
  wazeUrl: text("waze_url"), // lien Waze partageable (localisation du domaine)
  securitePhone: text("securite_phone"), // WhatsApp du gardien/sécurité du domaine
  estBase: boolean("est_base").default(false).notNull(), // entrepôt central (ex. Bureau Moderna Agency) : source des transferts de stock
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const logementTypeEnum = pgEnum("logement_type", ["villa", "appartement"]);

export const villas = pgTable(
  "villas",
  {
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
    // Certaines villas ont un second code, distinct du boîtier à clés, pour le digicode de la
    // porte d'entrée elle-même.
    codePorteEntree: text("code_porte_entree"),
    // Un troisième code possible, pour la porte de la chambre principale (utile aux
    // propriétaires/équipe, ex. dépôt d'affaires personnelles verrouillé pendant la location).
    codeChambreMaster: text("code_chambre_master"),
    codeWifi: text("code_wifi"),
    // Guide de bienvenue + instructions d'arrivée en photos — même document pour les deux usages
    // en pratique, un seul lien à tenir à jour (ex. Google Drive).
    guideBienvenueUrl: text("guide_bienvenue_url"),
    // Certaines personnes précises (pas toute une villa) sont payées directement par le
    // propriétaire pour le ménage ET la cuisine (ex. Khaoula pour la Villa Sofya, Aisha pour la
    // Villa Wimiliim) : les affectations restent possibles (traçabilité), mais aucun montant ni
    // paiement ne doit apparaître côté agence pour ces personnes-là sur cette villa. Les autres
    // membres de l'équipe qui interviennent sur la même villa restent payés normalement.
    personnelPayeParProprietaireNoms: jsonb("personnel_paye_par_proprietaire_noms").$type<string[]>().default([]).notNull(),
    proprietaireNom: text("proprietaire_nom"),
    proprietaireTelephone: text("proprietaire_telephone"),
    // Prénoms des personnes autorisées à s'identifier comme auteur dans le chat de l'espace
    // propriétaire (ex. plusieurs membres de la famille partagent le même lien) : si vide,
    // on retombe sur [proprietaireNom, "Kamel"].
    portailAuteurs: jsonb("portail_auteurs").$type<string[]>().default([]),
    lienProprietaireToken: uuid("lien_proprietaire_token").defaultRandom().notNull(), // token du lien public /p/[token] consulté par le propriétaire
    icalUrl: text("ical_url"), // lien iCal Superhote pour synchroniser les réservations de cette villa
    // Renseignés uniquement une fois la villa migrée vers Beds24 (remplacement progressif de
    // Superhote) : tant que beds24RoomId est vide, la villa continue de fonctionner comme
    // aujourd'hui (iCal Superhote), sans aucun effet de la synchro Beds24.
    beds24PropertyId: text("beds24_property_id"),
    beds24RoomId: text("beds24_room_id"),
    photoUrl: text("photo_url"),
    galleryUrls: jsonb("gallery_urls").$type<string[]>().default([]),
    superhoteListingId: text("superhote_listing_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("villas_lien_proprietaire_token_idx").on(t.lienProprietaireToken)]
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    superhoteBookingId: text("superhote_booking_id"),
    beds24BookingId: text("beds24_booking_id"),
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
    // Confirmation manuelle que le check-in/check-out a été effectué sur place (distinct de
    // l'heure prévue) : qui l'a fait et quand.
    checkinValideAt: timestamp("checkin_valide_at", { withTimezone: true }),
    checkinValidePar: text("checkin_valide_par"),
    checkoutValideAt: timestamp("checkout_valide_at", { withTimezone: true }),
    checkoutValidePar: text("checkout_valide_par"),
    // Suivi opérationnel équivalent à ce que montre Superhote mais qu'on ne peut pas récupérer
    // via leur flux iCal (pas d'API accessible) : renseigné à la main.
    assigneCheckin: text("assigne_checkin"),
    assigneMenage: text("assigne_menage"), // ancien champ texte libre, remplacé par personnelAffectations
    formulaireBienvenueEnvoye: boolean("formulaire_bienvenue_envoye").default(false).notNull(),
    formulaireCheckinRecu: boolean("formulaire_checkin_recu").default(false).notNull(),
    aRelancer: boolean("a_relancer").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("reservations_superhote_booking_id_idx").on(t.superhoteBookingId),
    uniqueIndex("reservations_beds24_booking_id_idx").on(t.beds24BookingId),
  ]
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
  technicianId: uuid("technician_id").references(() => technicians.id, { onDelete: "set null" }),
  urgence: interventionUrgenceEnum("urgence").default("normale").notNull(),
  categorie: interventionCategorieEnum("categorie").default("autre").notNull(),
  etape: interventionEtapeEnum("etape").default("signale").notNull(),
  notes: text("notes"),
  attachmentUrls: jsonb("attachment_urls").$type<string[]>().default([]),
  devis: jsonb("devis").$type<Devis[]>().default([]),
  signaleAt: timestamp("signale_at", { withTimezone: true }).defaultNow().notNull(),
  contacteAt: timestamp("contacte_at", { withTimezone: true }),
  planifieAt: timestamp("planifie_at", { withTimezone: true }),
  debutAt: timestamp("debut_at", { withTimezone: true }),
  finAt: timestamp("fin_at", { withTimezone: true }),
  // Validation du propriétaire : accepte / refuse via son lien public, sans connexion.
  validationStatut: text("validation_statut"), // null | "accepte" | "refuse"
  validationNote: text("validation_note"),
  validationAt: timestamp("validation_at", { withTimezone: true }),
  // "staff" (constat de l'équipe, ex. dégât trouvé au check-out) | "proprietaire" (demande du propriétaire)
  origine: text("origine").default("staff").notNull(),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Fil de discussion tracé sur une intervention : échanges entre l'équipe et le propriétaire
// (via le lien public), pour garder un historique de qui a dit quoi et quand.
export const interventionComments = pgTable("intervention_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  interventionId: uuid("intervention_id").references(() => interventions.id, { onDelete: "cascade" }).notNull(),
  auteur: text("auteur").notNull(),
  auteurType: text("auteur_type").notNull(), // "staff" | "proprietaire"
  message: text("message").notNull(),
  audioUrl: text("audio_url"), // note vocale jointe (WhatsApp...), optionnelle
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paiementProprietaireStatutEnum = pgEnum("paiement_proprietaire_statut", ["en_attente", "paye"]);

// Suivi de ce que Moderna Agency doit reverser au propriétaire (loyers perçus pour son compte,
// nuitées dues entre villas...), visible depuis son espace /p/[token].
export const paiementsProprietaire = pgTable("paiements_proprietaire", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }).notNull(),
  titre: text("titre").notNull(),
  description: text("description"),
  montant: numeric("montant", { precision: 10, scale: 2 }),
  devise: text("devise").default("DH").notNull(),
  statut: paiementProprietaireStatutEnum("statut").default("en_attente").notNull(),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Fil d'échanges par ligne de paiement, même principe que interventionComments.
export const paiementComments = pgTable("paiement_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  paiementId: uuid("paiement_id").references(() => paiementsProprietaire.id, { onDelete: "cascade" }).notNull(),
  auteur: text("auteur").notNull(),
  auteurType: text("auteur_type").notNull(), // "staff" | "proprietaire"
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const gendarmerieForms = pgTable("gendarmerie_forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "cascade" }),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
  // Quand la fiche fait partie d'un dossier combiné (fiche police + contrat en un seul lien).
  contratId: uuid("contrat_id").references(() => contratsLocation.id, { onDelete: "cascade" }),
  statut: text("statut").default("en_attente").notNull(), // en_attente | complete
  langue: text("langue"), // langue choisie par le client au remplissage
  // Le Bulletin Individuel ne concerne légalement que les adultes ; les photos des
  // passeports des enfants sont collectées à part, pour les besoins propres de l'agence.
  enfantsPassportUrls: jsonb("enfants_passport_urls").$type<string[]>().default([]),
  // Nombre d'adultes/enfants prévu quand ce lien unique n'est pas rattaché à une réservation
  // (généré depuis Documents pour tout un groupe) : sert à pré-remplir le formulaire avec
  // le bon nombre de personnes dès l'ouverture du lien, sans devoir cliquer "Ajouter" à la main.
  nbAdultesPrevu: integer("nb_adultes_prevu"),
  nbEnfantsPrevu: integer("nb_enfants_prevu"),
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
  signatureImage: text("signature_image"), // signature manuscrite (doigt/souris), data URL PNG
  photoPieceUrl: text("photo_piece_url"), // photo du passeport/CIN (data URL), pour la sécurité aux entrées de domaine
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contratsLocation = pgTable("contrats_location", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
  agenceRepresentant: text("agence_representant").default("Moderna Agency").notNull(),
  locataireNom: text("locataire_nom"),
  locataireAdresse: text("locataire_adresse"),
  nbAdultes: integer("nb_adultes").default(1).notNull(),
  nbEnfants: integer("nb_enfants").default(0).notNull(),
  dateArrivee: text("date_arrivee"),
  dateDepart: text("date_depart"),
  devise: text("devise").default("DH").notNull(),
  montantTotal: text("montant_total"),
  acompteMontant: text("acompte_montant"),
  soldeMontant: text("solde_montant"),
  soldeDateLimite: text("solde_date_limite"),
  depotGarantieMontant: text("depot_garantie_montant"),
  depotRestitutionDate: text("depot_restitution_date"),
  lieuSignature: text("lieu_signature").default("Marrakech").notNull(),
  dateSignatureAgence: text("date_signature_agence"),
  signatureAgenceNom: text("signature_agence_nom"),
  signatureAgenceImage: text("signature_agence_image"),
  statut: text("statut").default("en_attente").notNull(), // en_attente | signe
  signatureClientNom: text("signature_client_nom"), // nom légal saisi par le client au moment de signer
  signatureClientPiece: text("signature_client_piece"), // CIN / passeport saisi par le client au moment de signer
  signatureClientImage: text("signature_client_image"),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }),
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
  assigne: text("assigne").default("kamel").notNull(),
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const technicians = pgTable(
  "technicians",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nom: text("nom").notNull(),
    fonction: text("fonction").notNull(),
    telephone: text("telephone").notNull(),
    notes: text("notes"),
    // Token du lien perso /t/[token] consulté par le technicien, sans connexion.
    accessToken: uuid("access_token").defaultRandom().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("technicians_access_token_idx").on(t.accessToken)]
);

export const contactRoleEnum = pgEnum("contact_role", [
  "proprietaire",
  "femme_menage",
  "jardinier",
  "pisciniste",
  "gardien",
  "electricien",
  "plombier",
  "cuisiniere",
  "autre",
]);

// Annuaire de contacts par villa/appartement (ou par domaine entier quand le prestataire
// sert plusieurs biens, ex. jardinier/pisciniste du domaine) : qui contacter en cas de souci.
export const proprieteContacts = pgTable("propriete_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
  domaineId: uuid("domaine_id").references(() => domaines.id, { onDelete: "cascade" }),
  role: contactRoleEnum("role").notNull(),
  nom: text("nom").notNull(),
  telephone: text("telephone"),
  notes: text("notes"),
  // Personnel payé régulièrement (femme de ménage, jardinier...) : sert à afficher un
  // rappel "à payer ce mois-ci" en croisant avec les dépenses de la Caisse.
  paiementRecurrent: boolean("paiement_recurrent").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const personnelRoleEnum = pgEnum("personnel_role", ["menage", "cuisine"]);

// Distingue, pour une affectation de ménage, DEUX moments totalement différents et souvent
// confiés à des personnes différentes (Kamel, 2026-08-06) : "sejour" = ménage sollicité PENDANT
// le séjour du client (à sa demande, noté au check-in, payé au jour comme la cuisine) vs "depart"
// = ménage de fin de séjour pour préparer l'arrivée du client suivant (souvent 2-3 femmes,
// confirmé fait au check-out, tarif fixe). "unique" est la valeur neutre pour la cuisine (qui n'a
// pas cette distinction) — sert aussi de valeur par défaut pour ne jamais avoir de moment nul.
export const personnelAffectationMomentEnum = pgEnum("personnel_affectation_moment", ["sejour", "depart", "unique"]);

// Répertoire du personnel ménage/cuisine, indépendant des villas : une même personne peut
// tourner sur plusieurs villas, on la retrouve donc toujours sous la même fiche pour compter
// ses affectations (équité entre le personnel).
export const personnel = pgTable("personnel", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: text("nom").notNull(),
  role: personnelRoleEnum("role").notNull(),
  telephone: text("telephone"),
  notes: text("notes"),
  actif: boolean("actif").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Table de liaison : plusieurs personnes (ménage ou cuisine) peuvent être affectées au même
// séjour (ex. 2-3 femmes de ménage pour une grande villa) — d'où une table à part plutôt
// qu'une simple colonne FK unique sur reservations.
export const personnelAffectations = pgTable(
  "personnel_affectations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .references(() => reservations.id, { onDelete: "cascade" })
      .notNull(),
    personnelId: uuid("personnel_id")
      .references(() => personnel.id, { onDelete: "cascade" })
      .notNull(),
    // Ménage : coché une fois le départ du client passé et le ménage réellement confirmé fait
    // (l'affectation seule ne prouve pas que c'est fait).
    faitAt: timestamp("fait_at", { withTimezone: true }),
    // Cuisine : nombre de jours si elle n'a pas couvert tout le séjour (null = séjour complet).
    nbJours: integer("nb_jours"),
    // Cuisine : 100 MAD/jour si elle ne fait que le petit-déjeuner, 200 MAD/jour si elle fait
    // aussi le déjeuner.
    avecDejeuner: boolean("avec_dejeuner").default(false).notNull(),
    // Coché une fois la personne payée en liquide (200 MAD/ménage confirmé, 100 ou 200 MAD/jour
    // de cuisine selon avecDejeuner) — permet de calculer ce qu'il reste à payer sans le compter
    // deux fois.
    payeAt: timestamp("paye_at", { withTimezone: true }),
    // Note du client (1 à 5) sur le séjour, collectée au message de départ — appliquée à TOUTE
    // l'équipe (ménage + cuisine) de ce séjour, pas par personne individuellement : impossible de
    // démêler fiablement "5 pour la cuisinière, 2 pour le ménage" depuis un message WhatsApp en
    // langage libre. Sert à faire remonter les meilleures candidates en premier dans
    // findNextCandidate (staff.ts).
    note: integer("note"),
    // Ménage uniquement (voir personnelAffectationMomentEnum) — "unique" pour la cuisine, qui n'a
    // qu'un seul type d'affectation. La clé unique inclut ce champ pour que la MÊME personne
    // puisse être affectée à la fois pour le séjour et pour le départ sur la même réservation.
    moment: personnelAffectationMomentEnum("moment").default("unique").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("personnel_affectations_unique_idx").on(t.reservationId, t.personnelId, t.moment)]
);

// Fiche client : pour se souvenir des habitudes/préférences d'un voyageur qui revient
// (nom complet, pas de split nom/prénom séparé — les noms de réservation ne s'y prêtent pas
// de façon fiable). Le rapprochement avec les réservations passées se fait par téléphone
// (voir phonesMatch), pas par une clé stricte : deux personnes d'une même famille peuvent
// partager un numéro, donc on affiche une correspondance plutôt que de forcer un lien rigide.
export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  nom: text("nom").notNull(),
  telephone: text("telephone"),
  email: text("email"),
  notes: text("notes"), // habitudes / préférences (ex. "lit bébé à chaque fois", "aime les fruits secs")
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

// Réservations à ignorer définitivement lors de la synchro iCal (ex. erreur de Superhote qui
// associe une réservation à la mauvaise villa dans son propre flux) : sans ça, la réservation
// supprimée manuellement réapparaît à chaque synchro puisqu'elle est toujours dans le flux source.
export const ignoredBookings = pgTable("ignored_bookings", {
  superhoteBookingId: text("superhote_booking_id").primaryKey(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Catégories de messages, calquées sur les grandes sections déjà existantes de l'app — pour
// qu'un message trouve toujours une place logique plutôt que de tout mélanger dans un seul flux.
export const chatCategorieEnum = pgEnum("chat_categorie", [
  "menage_cuisine",
  "reservations",
  "maintenance",
  "caisse",
  "securite_documents",
  "urgent",
  "general",
]);

// Chat interne catégorisé (remplace les messages vocaux WhatsApp, faciles à perdre) : chaque
// message est écrit, horodaté, attribué à son auteur, et peut être marqué "traité" — surtout
// utile pour les changements de personnel de dernière minute, qui restent visibles comme
// "à traiter" tant que Kamel n'a pas confirmé les avoir pris en compte.
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  categorie: chatCategorieEnum("categorie").notNull(),
  villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
  // Une réponse à un message précis (ex. Imane répond à une question sur le ménage) reste
  // rattachée à son fil plutôt que noyée dans la liste générale de la catégorie — répondable à
  // tout moment, pas seulement dans la foulée.
  parentId: uuid("parent_id").references((): AnyPgColumn => chatMessages.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  traite: boolean("traite").default(false).notNull(),
  traiteAt: timestamp("traite_at", { withTimezone: true }),
  traitePar: text("traite_par"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Historique de conversation par numéro WhatsApp pour l'agent IA de réservation (webhook Meta
// Cloud API) — chaque appel du webhook est une invocation serverless indépendante, donc
// l'historique (au format Anthropic MessageParam[]) doit être persisté ici entre les messages
// d'une même conversation plutôt que gardé en mémoire.
export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phone: text("phone").notNull(), // format international avec "+", ex "+33672516297"
    messages: jsonb("messages").$type<unknown[]>().default([]).notNull(),
    // Id du dernier message WhatsApp traité (wamid...) — Meta peut livrer le même événement
    // plusieurs fois (webhooks "at-least-once"), et deux traitements concurrents du même message
    // pouvaient auparavant corrompre l'historique (cf incident du 02/08/2026). Sert à ignorer les
    // doublons.
    lastMessageId: text("last_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("whatsapp_conversations_phone_idx").on(t.phone)]
);

// Suivi d'une demande de personnel (ménage/cuisine) envoyée par l'agent IA via WhatsApp — une par
// réservation+rôle. La cascade (essayer la personne suivante si refus/pas de réponse) a besoin de
// se souvenir qui a déjà été sollicité et qui est en cours de sollicitation, entre deux appels de
// webhook indépendants.
export const staffAssignmentRequests = pgTable(
  "staff_assignment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .references(() => reservations.id, { onDelete: "cascade" })
      .notNull(),
    role: personnelRoleEnum("role").notNull(),
    statut: text("statut").default("en_recherche").notNull(), // en_recherche | confirme | sans_candidat
    candidatsEssayes: jsonb("candidats_essayes").$type<string[]>().default([]).notNull(),
    // Sollicitation groupée (2026-08-04, décidé par Kamel : "au pire on envoie le meme message a
    // 3 personnes, la premiere qui repond prend le projet") : plusieurs candidates reçoivent
    // l'offre en même temps plutôt qu'une seule à la fois — remplace l'ancien candidatActuelId
    // (unique) qui ne pouvait représenter qu'une candidate à la fois. La première à répondre "oui"
    // gagne (confirmation via UPDATE conditionnel WHERE statut='en_recherche', atomique) ; refusIds
    // suit les refus explicites du batch en cours pour savoir quand relancer un nouveau batch (tous
    // ont refusé, ou timeout — voir STALE_TIMEOUT_MS dans staff.ts) sans attendre inutilement.
    candidatsSollicitesIds: jsonb("candidats_sollicites_ids").$type<string[]>().default([]).notNull(),
    refusIds: jsonb("refus_ids").$type<string[]>().default([]).notNull(),
    personnelConfirmeId: uuid("personnel_confirme_id").references(() => personnel.id, { onDelete: "set null" }),
    // Journal des échanges WhatsApp (offre envoyée + réponse reçue, pour chaque candidate
    // sollicitée en cascade) — pour que Kamel puisse relire ce qui a réellement été dit, pas
    // juste le statut final. Contrairement à whatsappConversations (agent client), rien n'existait
    // avant pour ce fil : ajouté après que Kamel a demandé pourquoi l'onglet "Sollicitations
    // personnel" n'affichait pas de messages.
    historique: jsonb("historique")
      .$type<{ at: string; type: "offre" | "reponse" | "relance"; candidatNom: string; texte: string }[]>()
      .default([])
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("staff_assignment_requests_reservation_role_idx").on(t.reservationId, t.role)]
);
