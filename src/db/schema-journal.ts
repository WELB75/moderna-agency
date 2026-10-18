import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// Journal "qui a fait quoi, quand" sur les réservations et blocages — Fouad, 2026-10-16, après
// le blocage Amal Cosy du 16 au 18/10 créé sans trace de son auteur : "sécurise ça qu'on ait
// plus ce souci à l'avenir". Une ligne par action (création, suppression, annulation remontée
// par Beds24, changement d'heure, nouvelle fermeture Beds24), avec l'auteur (compte Clerk ou
// synchro automatique) et le résultat côté Beds24 (dates bien fermées/rouvertes sur Airbnb et
// Booking.com ou non).
//
// Volontairement SANS clé étrangère vers reservations : une suppression efface la réservation
// mais doit laisser sa trace ici (qui l'a supprimée, quand, quelles dates ont été rouvertes).
// Table créée à la volée si elle n'existe pas encore (voir assurerTableJournal dans
// src/lib/journal.ts) : pas de migration manuelle à lancer sur Neon.
export const reservationJournal = pgTable(
  "reservation_journal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id"),
    villaId: uuid("villa_id"),
    villaNom: text("villa_nom"),
    // "creation" | "suppression" | "annulation" | "modification_heures" | "fermeture_beds24"
    action: text("action").notNull(),
    // Résumé lisible figé au moment de l'action (voyageur, dates, canal) : reste lisible même
    // après suppression de la réservation.
    resume: text("resume"),
    auteurType: text("auteur_type").default("humain").notNull(), // "humain" | "systeme"
    auteurId: text("auteur_id"), // id utilisateur Clerk
    auteurNom: text("auteur_nom"),
    auteurEmail: text("auteur_email"),
    beds24Statut: text("beds24_statut"), // "ok" | "echec" | "non_concerne" | null
    beds24Detail: text("beds24_detail"),
    // Journal élargi (2026-10-18) : au-delà des réservations, toute action faite dans l'app et
    // chaque connexion. libelle = phrase lisible ("Solde reçu"), categorie = rangement/filtre
    // ("reservation", "caisse", "connexion"...), appareil/ip = d'où l'action a été faite,
    // sessionId = session Clerk (une seule ligne "connexion" par session).
    libelle: text("libelle"),
    categorie: text("categorie"),
    appareil: text("appareil"),
    ip: text("ip"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reservation_journal_reservation_idx").on(t.reservationId),
    index("reservation_journal_created_idx").on(t.createdAt),
  ]
);
